> Status: Draft
> Owner: @jdubz
> Last Updated: 2025-11-29

# Web Search for Company Discovery

**Purpose**: Provide web search results to the AI agent during company enrichment to prevent sparse data and reduce hallucination.

## The Problem
Currently, company enrichment uses a Google search URL placeholder (`https://www.google.com/search?q={company_name}`). The AI agent has no actual search results to work with, leading to incomplete company profiles.

## The Solution
Call a search API (Tavily or Brave) and pass the raw results directly to the AI agent for extraction.

## Implementation

### 1. Add Search Client
Create a simple search client interface with Tavily implementation:

```python
class SearchClient:
    def search(self, query: str, max_results: int = 5) -> List[Dict]:
        """Returns list of search results with title, url, snippet."""
        pass
```

### 2. Integrate in Company Processor
In `company_processor.py`, when processing a company task:
- Call `search_client.search(company_name + " official website")`
- Pass results to AI agent in the prompt context
- Let AI extract website, HQ, size, description, etc.

### 3. Configuration
```bash
SEARCH_PROVIDER=tavily  # or brave
SEARCH_API_KEY=<key>
```

No feature flag - always on when API key is set.

## That's It
- No quota management (we'll add later if needed)
- No parsing/extraction (AI does this)
- No persistence of search results
- No confidence scores
- No one-call-per-company guards

Just fetch search results and give them to the AI.

## Monitoring and Future Safeguards
**Important**: This MVP implementation defers several operational safeguards to keep things simple:

- **Cost Risk**: Without quota management, a large influx of companies could exhaust free tier quotas (Tavily: 1k/month, Brave: 2k/month) and incur unexpected costs. Monitor usage closely.
- **Redundancy Risk**: Without one-call-per-company guards, repeated processing attempts may waste API calls on the same company.

**Action Items**:
- Monitor search API usage in logs and dashboard
- Consider implementing quota tracking and one-call-per-company guards if usage is higher than expected
- Set up alerts for approaching quota limits
