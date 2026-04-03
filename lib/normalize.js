
//Normalize phone by reducing to digits and removing prefix
function normalizePhone(raw) {
	if (!raw) return null;
	const digits = raw.replace(/\D/g, '');
	const trimmed = (digits.length === 11 && digits.startsWith('1')) ? digits.slice(1): digits;
	return trimmed.length >= 7 ? trimmed : null;
}

//Normalize multiple phones
function normalizePhones(raw) {
	if (!raw) return [];
	const GARBAGE = new Set([
		'0000000000', '9999999999', '1234567890',
		'1111111111', '2222222222','3333333333',
		'4444444444', '5555555555', '6666666666',
		'7777777777', '8888888888'
	]);

	return raw
		.split('|')
		.map(p => normalizePhone(p.trim()))
		.filter(p => p && !GARBAGE.has(p) && !/^(\d)\1{6,}$/.test(p));
}

//Normalize domain by extracting hostname
function normalizeDomain(raw) {
	if (!raw) return null;
	try {
		const withProto = raw.match(/^https?:\/\//) ? raw : `https://${raw}`;
		const url = new URL(withProto);
		return url.hostname.replace(/^www\./, '');
	} catch {
		return raw
			.replace(/^https?:\/\//, '')
			.replace(/^www\./, '')
			.split('/')[0]
			.toLowerCase()
			.trim();
	}
}

//Extract letter-only domain name
function domainRoot(raw) {
	if (!raw) return '';
	const domain = normalizeDomain(raw) || '';
	return domain
		.split('.')[0] 
		.replace(/[^a-z0-9]/g, '');
}

//Extract user or ID from facebook link
function normalizeFacebook(raw) {
	if (!raw) return null;
	const idMatch = raw.match(/profile\.php\?id=(\d+)/);
	if (idMatch) return idMatch[1];
	try {
		const withProto = raw.match(/^https?:\/\//) ? raw : `https://${raw}`;
		const url = new URL(withProto);
		if (!url.hostname.includes('facebook')) return null;
		const parts = url.pathname.split('/').filter(Boolean);
		return parts[parts.length - 1]?.toLowerCase() || null;
	} catch {
		const parts = raw.split('/').filter(Boolean);
		return parts[parts.length - 1]?.toLowerCase() || null;
	}
}

//extract facebook links from a list of multiple
function extractFacebookLinks(socialRaw) {
	if (!socialRaw) return [];
	return socialRaw
		.split('|')
		.map(s => s.trim())
		.filter(s => s.toLowerCase().includes('facebook'))
		.map(normalizeFacebook)
		.filter(Boolean);
}

//Lowercase letter and digit name
function normalizeName(raw) {
	if (!raw) return '';
	return raw
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

//lowercase letter and digit name
function condenseName(raw) {
	if (!raw) return '';
	return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeAllNames(raw) {
	if (!raw) return [];
	return raw.split('|').map(n => n.trim()).filter(Boolean);
}

module.exports = {
	normalizePhone,
	normalizePhones,
	normalizeDomain,
	domainRoot,
	normalizeFacebook,
	extractFacebookLinks,
	normalizeName,
	condenseName,
	normalizeAllNames,
};
