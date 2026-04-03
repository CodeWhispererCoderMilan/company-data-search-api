
# Company Data Search API

Search API using normalized data formats paired with Elasticsearch boolean queries implementing a matching algorithm combining exact matches and fuzzy search.

For the normalization:

Phones: remove all prefixes and non-digits
domains: kept only the domain normalized
Facebook: extracted unique IDs and userIds from FB links
Names: lowercase only, keeping both a condensed full version and a each word (except for stop words) individually

Matching Algorithm:

cellphones: exact match scores very high (although wrong numbers are accounted)

domains: exact matches scoring the highest since it is very reliable

facebook: exact matches also scoring high, not quite as high as domains, but higher than numbers since typos are less likely

names: 	Since  names can span more fields and are central to a search, I split them to extract important words and fuzzy seatch both their contents and the condensed version of the full name across all name types in the document with lower scores for each. I also add a wildcard should clause for domains perfectly matching the name with a high score.

ES index settings:
Name analyzer for fuzzysearch with lowerscase & stop words filter.
CSV headers are used for keyword fields with exact matches.
Text fields are ran through analyzer for fuzzy search.
Company commercial name uses both text and keywords for fuzzy and exact matches.

Bonus Points: I have added a compute confidence field to reflect the accuracy of the match by matching the input profile to the retrieved profile by field.

The API returns a match for all 32 entries in the provided test sample, however I did not implement a proper match rate metric against the full 1000 profiles. The single top Elasticsearch result is returned with no fallback, so any case where the top result is wrong counts as a missed match. The confidence score partially addresses this by flagging low-certainty results, but a proper solution would retrieve the multiple top candidates, providing the required match rate, the time contraint limited my implementation.


