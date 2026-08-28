# NickSeer Patch Note — 2026-08-28 03:20
**Scope:** AI Taste Curation Upgrade, Intelligent Candidate Pool Filtering (Eliminating Kids/Family & Concert Anomalies), Multi-Seed Overlap & Genre Affinity Weighting.

### Problem Statement:
- When a user watched prestige adult series (e.g. *Sex and the City*, *Game of Thrones*, *House of the Dragon*, *Narcos*, *Cape Fear*), single-seed TMDB recommendation lookups (like *The Legend of Korra*) flooded the candidate pool with high-average children's cartoons (*Amphibia*, *She-Ra*, *Star vs The Forces of Evil*, *Hey Arnold!*) and concert videos (*Taylor Swift Tour*).
- The AI prompt lacked strict negative curation instructions regarding tone, maturity level, and thematic depth.

### Technical Implementation:
- **`server/recommend/ai.js` (LLM Prompt & Curation Architecture)**:
  - Rebuilt the system prompt as an expert cinema curator.
  - Instructed the LLM to analyze the viewer's core taste (prestige drama, gritty crime, dark thriller, mature comedy, epic fantasy) and strictly avoid kids' cartoons, children's TV, and music concerts unless the viewer's watch history consists primarily of those genres.
  - Increased selection size to 18-20 ranked picks with concise 4-6 word contextual justifications.
- **`server/routes/discover.js` (`/ai-suggest`) & `server/recommend/engine.js`**:
  - Implemented dynamic seed genre affinity analysis (`seedGenreFreq`).
  - Added smart content-type guards: if the viewer has no Kids (`10762`), Family (`10751`), or Music (`10402`) seeds, automatically filter out kids animation and concert tour titles from the candidate pool before LLM evaluation.
  - Scored candidates based on multi-seed match and genre frequency overlap (`_matchScore`), prioritizing prestige shows matching the user's primary taste (*The Sopranos*, *Ozark*, *Succession*, *Boardwalk Empire*, *Peaky Blinders*, *The Wire*, *Shogun*).
  - Invalidate old suggestion caches by bumping the cache key to `ai-suggest:v4:...`.