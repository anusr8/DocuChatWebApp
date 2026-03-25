-- RPC for searching PDFs
create or replace function match_gtm_pdfs (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  content text,
  name text,
  url text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    gtm_pdfs.id,
    gtm_pdfs.content,
    gtm_pdfs.name,
    gtm_pdfs.url,
    1 - (gtm_pdfs.embedding <=> query_embedding) as similarity
  from gtm_pdfs
  where 1 - (gtm_pdfs.embedding <=> query_embedding) > match_threshold
  order by gtm_pdfs.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- RPC for searching PPTs
create or replace function match_gtm_ppts (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  content text,
  name text,
  url text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    gtm_ppts.id,
    gtm_ppts.content,
    gtm_ppts.name,
    gtm_ppts.url,
    1 - (gtm_ppts.embedding <=> query_embedding) as similarity
  from gtm_ppts
  where 1 - (gtm_ppts.embedding <=> query_embedding) > match_threshold
  order by gtm_ppts.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- RPC for searching Word Docs
create or replace function match_gtm_word_docs (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  content text,
  name text,
  url text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    gtm_word_docs.id,
    gtm_word_docs.content,
    gtm_word_docs.name,
    gtm_word_docs.url,
    1 - (gtm_word_docs.embedding <=> query_embedding) as similarity
  from gtm_word_docs
  where 1 - (gtm_word_docs.embedding <=> query_embedding) > match_threshold
  order by gtm_word_docs.embedding <=> query_embedding
  limit match_count;
end;
$$;
-- RPC for searching Videos
create or replace function match_gtm_videos (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  content text,
  name text,
  url text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    gtm_videos.id,
    gtm_videos.content,
    gtm_videos.name,
    gtm_videos.url,
    1 - (gtm_videos.embedding <=> query_embedding) as similarity
  from gtm_videos
  where 1 - (gtm_videos.embedding <=> query_embedding) > match_threshold
  order by gtm_videos.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- RPC for Deep Search across granular chunks
create or replace function match_gtm_chunks (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  asset_id bigint,
  asset_type text,
  asset_name text,
  asset_url text,
  content text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    gtm_asset_chunks.id,
    gtm_asset_chunks.asset_id,
    gtm_asset_chunks.asset_type,
    gtm_asset_chunks.asset_name,
    gtm_asset_chunks.asset_url,
    gtm_asset_chunks.content,
    1 - (gtm_asset_chunks.embedding <=> query_embedding) as similarity
  from gtm_asset_chunks
  where 1 - (gtm_asset_chunks.embedding <=> query_embedding) > match_threshold
  order by gtm_asset_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;
