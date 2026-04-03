const http = require('http');
const { Client } = require('@elastic/elasticsearch');

const { buildQuery, computeConfidence } = require('./lib/match');
const { normalizePhone, normalizeDomain, normalizeFacebook } = require('./lib/normalize');

const PORT = process.env.PORT || 3000;
const ES_URL = process.env.ES_URL || 'http://localhost:9200';
const INDEX = 'companies';

const client = new Client({ node: ES_URL });

// read request body
function readBody(req) {
	return new Promise((resolve, reject) => {
		let data = '';
		req.on('data', chunk => { data += chunk; });
		req.on('end', () => {
			try {
				resolve(data ? JSON.parse(data) : {});
			} catch {
				reject(new Error('Invalid JSON body'));
			}
		});
		req.on('error', reject);
	});
}

// send JSON response
function send(res, status, body) {
	const json = JSON.stringify(body, null, 2);
	res.writeHead(status, {
		'Content-Type': 'application/json',
		'Content-Length': Buffer.byteLength(json),
	});
	res.end(json);
}

// build query based on input, matched_on for which fields matched_on by comparing to profile
async function searchCompany(input) {
	const query = buildQuery(input);

	if (!query) {
		return { match: null, confidence: 0, matched_on: [], message: 'No usable input fields provided.' };
	}

	const result = await client.search({
		index: INDEX,
		body: query,
	});

	const hits = result.hits?.hits || [];

	if (hits.length === 0) {
		return { match: null, confidence: 0, matched_on: [] };
	}

	const top = hits[0];
	const profile = top._source;
	const esScore = top._score;

	const matchedOn = [];
	const cleanPhone = normalizePhone(input.phone);
	if (cleanPhone && profile.phone_numbers?.includes(cleanPhone)) matchedOn.push('phone');

	const cleanDomain = normalizeDomain(input.website);
	if (cleanDomain && profile.domain === cleanDomain) matchedOn.push('website');

	const cleanFb = normalizeFacebook(input.facebook);
	if (cleanFb && profile.facebook_pages?.includes(cleanFb)) matchedOn.push('facebook');

	if (!matchedOn.includes('phone') && !matchedOn.includes('website') && !matchedOn.includes('facebook')) {
		matchedOn.push('name');
	}
	//calculate match accuracy score
	const confidence = computeConfidence(input, profile, esScore);

	return {
		match: profile,
		confidence,
		matched_on: matchedOn,
		_es_score: esScore, 
	};
}


async function handleRequest(req, res) {
	const url = new URL(req.url, `http://localhost:${PORT}`);

	// Health check
	if (req.method === 'GET' && url.pathname === '/health') {
		const esHealth = await client.cluster.health().catch(() => null);
		return send(res, 200, {
			status: 'ok',
			elasticsearch: esHealth?.status || 'unreachable',
		});
	}

	// Main search endpoint
	if (req.method === 'POST' && url.pathname === '/search') {
		let body;
		try {
			body = await readBody(req);
		} catch (err) {
			return send(res, 400, { error: err.message });
		}

		const input = {
			name: body.name || body.input_name || '',
			phone: body.phone || body.input_phone || '',
			website: body.website || body.input_website || '',
			facebook: body.facebook || body.input_facebook || '',
		};

		try {
			const result = await searchCompany(input);
			return send(res, 200, result);
		} catch (err) {
			console.error('Search error:', err);
			return send(res, 500, { error: 'Search failed', detail: err.message });
		}
	}

	// Batch search for testing the CSV
	if (req.method === 'POST' && url.pathname === '/search/batch') {
		let body;
		try {
			body = await readBody(req);
		} catch (err) {
			return send(res, 400, { error: err.message });
		}

		if (!Array.isArray(body)) {
			return send(res, 400, { error: 'Batch endpoint expects a JSON array.' });
		}

		try {
			const results = await Promise.all(
				body.map(async item => {
					const input = {
						name: item.name || item['input name'] || item.input_name || '',
						phone: item.phone || item['input phone'] || item.input_phone || '',
						website: item.website || item['input website'] || item.input_website || '',
						facebook: item.facebook || item['input_facebook'] || item.input_facebook || '',
					};
					const result = await searchCompany(input);
					return { input, ...result };
				})
			);

			const matched = results.filter(r => r.match !== null).length;
			const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

			return send(res, 200, {
				total: results.length,
				matched,
				match_rate: `${((matched / results.length) * 100).toFixed(1)}%`,
				avg_confidence: Math.round(avgConfidence),
				results,
			});
		} catch (err) {
			console.error('Batch search error:', err);
			return send(res, 500, { error: 'Batch search failed', detail: err.message });
		}
	}

	return send(res, 404, { error: 'Not found. Available: POST /search, POST /search/batch, GET /health' });
}

//server logic with beautified logging
async function main() {
	try {
		const info = await client.info();
		console.log(`✓ Connected to Elasticsearch ${info.version.number}`);
	} catch (err) {
		console.error('✗ Cannot reach Elasticsearch at', ES_URL);
		console.error('  Start it with: docker run -d --name es -p 9200:9200 -e "discovery.type=single-node" -e "xpack.security.enabled=false" docker.elastic.co/elasticsearch/elasticsearch:8.13.0');
		process.exit(1);
	}

	const server = http.createServer(async (req, res) => {
		try {
			await handleRequest(req, res);
		} catch (err) {
			console.error('Unhandled error:', err);
			if (!res.headersSent) send(res, 500, { error: 'Internal server error' });
		}
	});

	server.listen(PORT, () => {
		console.log(`✓ Server listening on http://localhost:${PORT}`);
		console.log(`  POST /search        — single company lookup`);
		console.log(`  POST /search/batch  — array of inputs (for CSV testing)`);
		console.log(`  GET  /health        — health check`);
	});
}

main().catch(err => {
	console.error('Server startup failed:', err);
	process.exit(1);
});
