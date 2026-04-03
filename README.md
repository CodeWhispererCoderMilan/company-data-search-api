
# Company Data Search API


I built the search API using normalized data formats paired with Elasticsearched boolean queries for a matching algorithm that mixed exact matches and fuzzy search.

For the normalization:

Phones: remove all prefixes and non-digits
domains: kept only the domain normalized
Facebook: extracted unique IDs and userIds from FB links
Names: lowercase only, keeping both a condensed full version and a each word (except for stop words) individually

Matching Algorithm:

cellphones: exact match scores very high (although wrong numbers are accounted)

domains: exact matches scoring the highest since it is very reliable

facebook: exact matches also scoring high, not quite as high as domains, but higher than numbers since typos are less likely

names: 	name is fuzzy matched across all name fields and domain, same is done for the words the name contais through wildcard matching against domain names and condensed company names. There is also a fallback matching condensed name from the search against the condensed names in the data.

ES index settings:
Name analyzer for fuzzysearch with lowerscase & stop words filter.
CSV headers are used for keyword fields with exact matches.
Text fields are ran through analyzer for fuzzy search.
Companmy commercial name uses both text and keywords for fuzzy and exact matches.

Bonus Points: I have added a compute confidence field to reflect the accuract of the match by matching the input profile to the retrieved profile by field
