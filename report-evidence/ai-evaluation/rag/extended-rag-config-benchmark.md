## Dataset Quality Note

The first benchmark run was treated as a smoke test because the initial dataset contained only short documents. Each document was shorter than the smallest tested chunk size, so all chunk-size and overlap configurations generated the same number of chunks and achieved identical retrieval metrics.

To make the evaluation meaningful, the dataset was expanded with longer documents and more evaluation questions. This allowed the experiment to observe how chunk size, overlap, and embedding dimension affect retrieval quality, storage cost, and latency.