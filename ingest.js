const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { Client } = require('@elastic/elasticsearch');

const {
	normalizePhones,
	normalizeDomain,
	domainRoot,
	extractFacebookLinks,
	condenseName,
	normalizeAllNames,
} = require('./lib/normalize');

const INDEX = 'companies';
const ES_URL = process.env.ES_URL || 'http://localhost:9200';
const client = new Client({ node: ES_URL });

//read csv and return array of records
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

//create fresh index and delete previous
async function setupIndex() {
	try {
		await client.indices.delete({ index: INDEX });
		console.log(`Index "${INDEX}" deleted for fresh ingest...`);
	} catch {
	}
//creates name analyzer with lowerscase, no stop words for fuzzy search
//use the csv headers for keyword fields with exact matches
//text fields are ran throug analyzer for fuzzy search
//companmy commercial name uses both text and keywords for fuzzy and exact matches
	await client.indices.create({
		index: INDEX,
		body: {
			settings: {
				number_of_shards: 1,
				number_of_replicas: 0,
				analysis: {
					analyzer: {
						name_analyzer: {
							type: 'custom',
							tokenizer: 'standard',
							filter: ['lowercase', 'stop'],
						},
					},
				},
			},
			mappings: {
				properties: {
					domain:           { type: 'keyword' },
					domain_root:      { type: 'keyword' }, 
					phone_numbers:    { type: 'keyword' },
					facebook_pages:   { type: 'keyword' },

					company_commercial_name: {
						type: 'text',
						analyzer: 'name_analyzer',
						fields: { keyword: { type: 'keyword' } },
					},
					company_legal_name: { type: 'text', analyzer: 'name_analyzer' },
					all_names_text:     { type: 'text', analyzer: 'name_analyzer' },
					all_names_normalized: { type: 'keyword' },
					all_names_condensed:  { type: 'keyword' },

					social_media: { type: 'keyword' },
					addresses:    { type: 'text' },
					raw_phones:   { type: 'keyword' },
				},
			},
		},
	});

	console.log(`Index "${INDEX}" created.`);
}

//build document ES document structure using CSV rows
function buildDocument(scraped) {
	const allNamesRaw = normalizeAllNames(scraped.company_all_available_names);
	const allNamesUnique = [...new Set(allNamesRaw)];
	const phones = normalizePhones(scraped.phone_numbers);
	const facebookPages = extractFacebookLinks(scraped.social_media);
	const socialLinks = scraped.social_media
		? scraped.social_media.split('|').map(s => s.trim()).filter(Boolean)
		: [];

	const domain = normalizeDomain(scraped.domain) || scraped.domain;

	return {
		domain,
		domain_root: domainRoot(domain),
		company_commercial_name: scraped.company_commercial_name || '',
		company_legal_name: scraped.company_legal_name || '',
		all_names_text: allNamesUnique.join(' '),
		all_names_normalized: allNamesUnique,
		all_names_condensed: allNamesUnique.map(condenseName).filter(Boolean),
		phone_numbers: phones,
		raw_phones: scraped.phone_numbers
		? scraped.phone_numbers.split('|').map(p => p.trim()).filter(Boolean)
		: [],
		facebook_pages: facebookPages,
		social_media: socialLinks,
		addresses: scraped.addresses || '',
	};
}

//send documents to ES in batches, once done, refresh index to search them
async function bulkIndex(documents) {
	const BATCH_SIZE = 100;
	let indexed = 0;
	let errors = 0;

	for (let i = 0; i < documents.length; i += BATCH_SIZE) {
		const batch = documents.slice(i, i + BATCH_SIZE);
		const operations = batch.flatMap(doc => [{ index: { _index: INDEX } }, doc]);
		const result = await client.bulk({ body: operations, refresh: false });

		if (result.errors) {
			result.items.forEach(item => {
				if (item.index?.error) { console.error('Index error:', item.index.error); errors++; }
			});
		}
		indexed += batch.length - errors;
		process.stdout.write(`\rIndexed ${indexed}/${documents.length}...`);
	}

	await client.indices.refresh({ index: INDEX });
	console.log(`\nDone. Indexed: ${indexed}, Errors: ${errors}`);
}

//run ingestion logic in order
async function main() {
	console.log('Reading CSVs...');
	const scraped = await readCsv(path.join(__dirname, 'data', 'scraped-results.csv'));
	console.log(`  scraped-results.csv: ${scraped.length} rows`);

	console.log('Building documents...');
	const documents = scraped.map(buildDocument);

	await setupIndex();

	console.log('Indexing...');
	await bulkIndex(documents);

	const count = await client.count({ index: INDEX });
	console.log(`\nElasticsearch index "${INDEX}" now has ${count.count} documents.`);
}

main().catch(err => {
	console.error('Ingest failed:', err);
	process.exit(1);
});
