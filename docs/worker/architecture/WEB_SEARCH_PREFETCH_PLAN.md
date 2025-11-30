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
