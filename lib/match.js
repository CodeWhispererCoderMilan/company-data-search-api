const {
	normalizePhone,
	normalizeDomain,
	normalizeFacebook,
	normalizeName,
	condenseName,
} = require('./normalize');

const MEANINGLESS_WORDS = new Set([
	'the', 'and', 'of', 'a', 'an', 'in', 'for', 'to', 'by',
	'services', 'service', 'group', 'company', 'solutions', 'consulting',
	'management', 'international', 'usa', 'us',
]);

// split input name into meaningful words, removing common words and short words
function nameWords(raw) {
	if (!raw) return [];
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.split(/\s+/)
		.map(w => w.trim())
		.filter(w => w.length >= 3 && !MEANINGLESS_WORDS.has(w));
}

//Create a bool query using should clauses with accumulating scores
function buildQuery(input) {
	const { name, phone, website, facebook } = input;
	const shoulds = [];
	const cleanPhone = normalizePhone(phone);

	//exact phone number matches give us a high boost although
	//a matching name or account is stronger since there are mistaken nphones
	if (cleanPhone) {
		shoulds.push({
			term: { 'phone_numbers': { value: cleanPhone, boost: 5 } },
		});
	}

	//generic domains are skipped, exact domain matches score very high
	const cleanDomain = normalizeDomain(website);
	const GENERIC_DOMAINS = new Set(['google.com', 'facebook.com', 'wordpress.com']);
	if (cleanDomain && !GENERIC_DOMAINS.has(cleanDomain)) {
		shoulds.push({
			term: { 'domain': { value: cleanDomain, boost: 9 } },
		});
	}
	//exact match on the FB id or slug is very reliable - high boost
	const cleanFb = normalizeFacebook(facebook);
	if (cleanFb) {
		shoulds.push({
			term: { 'facebook_pages': { value: cleanFb, boost: 8 } },
		});
	}

	//name is fuzzy matched across all name fields and domain
	//also does per word wildcard matching against domain names and condensed company names
	//as well as condensed name search against all condensed names
	if (name && name.trim()) {
		const cleanName = normalizeName(name);
		const condName = condenseName(name);
		const words = nameWords(name);

		shoulds.push({
			match: {
				'all_names_text': {
					query: cleanName,
					fuzziness: 'AUTO',
					boost: 5,
				},
			},
		});

		shoulds.push({
			match: {
				'company_commercial_name': {
					query: name.trim(),
					fuzziness: 'AUTO',
					boost: 4,
				},
			},
		});

		for (const word of words) {
			shoulds.push({
				fuzzy: {
					'domain_root': {
						value: word,
						fuzziness: 'AUTO',
						boost: 7,
					},
				},
			});
			shoulds.push({
				wildcard: {
					'domain_root': { value: `*${word}*`, boost: 15 },
				},
			});
			shoulds.push({
				wildcard: {
					'all_names_condensed': {
						value: `*${word}*`,
						boost: 6,
					},
				},
			});
		}

		if (condName) {
			shoulds.push({
				wildcard: {
					'all_names_condensed': { value: `*${condName}*`, boost: 3 },
				},
			});
		}
	}
	if (shoulds.length === 0) return null;
	return {
		size: 1,
		query: {
			bool: {
				should: shoulds,
				minimum_should_match: 1,
			},
		},
		track_scores: true,
	};
}

//verify each input field against the profile and compute a match accuracy score
function computeConfidence(input, profile, esScore) {
	const { name, phone, website, facebook } = input;
	let matched = 0;
	let total = 0;

	const cleanInputPhone = normalizePhone(phone);
	if (cleanInputPhone) {
		total += 3;
		if (profile.phone_numbers?.includes(cleanInputPhone)) matched += 3;
	}

	const cleanInputDomain = normalizeDomain(website);
	if (cleanInputDomain && !['google.com', 'facebook.com'].includes(cleanInputDomain)) {
		total += 3;
		if (profile.domain === cleanInputDomain) matched += 3;
	}

	const cleanInputFb = normalizeFacebook(facebook);
	if (cleanInputFb) {
		total += 2;
		if (profile.facebook_pages?.includes(cleanInputFb)) matched += 2;
	}

	if (name) {
		total += 2;
		const condInput = condenseName(name);
		const domainRootMatch = profile.domain_root && condInput.includes(profile.domain_root);
		const nameMatch = (profile.all_names_normalized || []).some(n => {
			const condN = condenseName(n);
			return condN.includes(condInput) || condInput.includes(condN);
		});
		if (nameMatch || domainRootMatch) matched += 2;
	}

	if (total === 0) return 0;
	return Math.round((matched / total) * 100);
}

module.exports = { buildQuery, computeConfidence };
