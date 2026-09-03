## Result Summary

The answer-quality evaluation showed that A1_smaller_chunk and A4_larger_overlap achieved the highest overall quality score.

```text
A1_smaller_chunk overall_quality_score = 5.0000
A4_larger_overlap overall_quality_score = 5.0000
A3_smaller_overlap overall_quality_score = 4.9867
A2_larger_chunk overall_quality_score = 4.8400
A0_baseline overall_quality_score = 4.8286
```

A1 achieved excellent answer quality but increased the number of chunks from 22 to 33, which increased storage and document-processing cost.

A4 achieved the same overall answer quality as A1 while keeping the same number of chunks and vector storage as the baseline. Therefore, A4 was selected as the final production configuration.

## Selected Configuration

```text
chunk_size = 1800
overlap = 400
embedding_dimension = 768
top_k = 5
prompt_variant = grounded_rule
```