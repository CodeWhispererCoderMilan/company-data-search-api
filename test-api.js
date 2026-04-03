const http = require('http');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');

function readCsv(filePath) {
	return new Promise((resolve, reject) => {
		const records = [];
		fs.createReadStream(filePath)
			.pipe(parse({ columns: true, trim: true, skip_empty_lines: true }))
			.on('data', row => records.push(row))
			.on('end', () => resolve(records))
			.on('error', reject);
	});
}

function postJson(path, body) {
	return new Promise((resolve, reject) => {
		const data = JSON.stringify(body);
		const options = {
			hostname: 'localhost',
			port: process.env.PORT || 3000,
			path,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(data),
			},
		};

		const req = http.request(options, res => {
			let raw = '';
			res.on('data', chunk => { raw += chunk; });
			res.on('end', () => {
				try { resolve(JSON.parse(raw)); }
				catch { reject(new Error('Invalid JSON response')); }
			});
		});

		req.on('error', reject);
		req.write(data);
		req.end();
	});
}

//test logic with beautified logging allong with accuracy metrics and match details
async function main() {
	const rows = await readCsv(path.join(__dirname, 'data', 'API-input-sample.csv'));
	console.log(`Loaded ${rows.length} test rows from API-input-sample.csv\n`);

	const inputs = rows.map(row => ({
		name: row['input name'] || '',
		phone: row['input phone'] || '',
		website: row['input website'] || '',
		facebook: row['input_facebook'] || '',
	}));

	const response = await postJson('/search/batch', inputs);

	console.log('═'.repeat(70));
	console.log(`RESULTS SUMMARY`);
	console.log('═'.repeat(70));
	console.log(`Total inputs:      ${response.total}`);
	console.log(`Matched:           ${response.matched}`);
	console.log(`Match rate:        ${response.match_rate}`);
	console.log(`Avg confidence:    ${response.avg_confidence}%`);
	console.log('═'.repeat(70));
	console.log();

	// Print each result
	response.results.forEach((r, i) => {
		const inputLine = [r.input.name, r.input.phone, r.input.website, r.input.facebook]
			.filter(Boolean).join(' | ') || '(no input)';

		if (r.match) {
			console.log(`[${i + 1}] ✓ ${inputLine}`);
			console.log(`      → ${r.match.company_commercial_name} (${r.match.domain})`);
			console.log(`        confidence: ${r.confidence}% | matched on: ${r.matched_on.join(', ')}`);
			console.log(`        phones:     ${r.match.raw_phones?.join(' | ') || '—'}`);
			console.log(`        social:     ${r.match.social_media?.join(' | ') || '—'}`);
			console.log(`        address:    ${r.match.addresses || '—'}`);
			console.log(`        all names:  ${r.match.all_names_normalized?.join(' | ') || '—'}`);
		} else {
			console.log(`[${i + 1}] ✗ ${inputLine}`);
			console.log(`        no match found`);
		}
		console.log();
	});
}

main().catch(err => {
	console.error('Test failed:', err.message);
	console.error('Make sure the server is running: node server.js');
	process.exit(1);
});
