-- Create tables for different GTM asset types

-- 1. PDF Table
create table if not exists gtm_pdfs (
  id bigserial primary key,
  content text,
  embedding vector(768), -- Full content embedding
  metadata_embedding vector(768), -- Name + Summary embedding
  name text,
  url text, -- Public URL from Supabase Storage
  category text, -- AI Generated Category
  tags text[], -- AI Generated Tags
  thumbnail_url text, -- URL to generated thumbnail image
  summary text, -- AI Generated Summary
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. PPT Table
create table if not exists gtm_ppts (
  id bigserial primary key,
  content text,
  embedding vector(768),
  metadata_embedding vector(768),
  name text,
  url text,
  category text,
  tags text[],
  thumbnail_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Word Doc Table
create table if not exists gtm_word_docs (
  id bigserial primary key,
  content text,
  embedding vector(768),
  metadata_embedding vector(768),
  name text,
  url text,
  category text,
  tags text[],
  thumbnail_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Video Table
create table if not exists gtm_videos (
  id bigserial primary key,
  content text, -- Transcription/Summary from Gemini
  embedding vector(768),
  metadata_embedding vector(768),
  name text,
  url text,
  category text,
  tags text[],
  thumbnail_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Audio Table
create table if not exists gtm_audio (
  id bigserial primary key,
  content text, -- Transcription/Summary from Gemini
  embedding vector(768),
  metadata_embedding vector(768),
  name text,
  url text,
  category text,
  tags text[],
  thumbnail_url text,
  summary text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS (Optional but recommended, verify policies if needed)
alter table gtm_pdfs enable row level security;
alter table gtm_ppts enable row level security;
alter table gtm_word_docs enable row level security;
alter table gtm_videos enable row level security;
alter table gtm_audio enable row level security;

-- 5. Granular Asset Chunks Table (for Deep Search)
create table if not exists gtm_asset_chunks (
  id bigserial primary key,
  asset_id bigint, -- Reference to the original asset (manual join)
  asset_type text, -- 'pdf', 'ppt', 'word', 'video'
  asset_name text,
  asset_url text,
  content text, -- The specific chunk of text
  embedding vector(768),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table gtm_asset_chunks enable row level security;

-- Create a bucket for GTM Assets if it doesn't exist
-- Note: You usually do this in the Storage UI, but here is the SQL equivalent if supported or just for reference.
insert into storage.buckets (id, name, public) 
values ('gtm-assets', 'gtm-assets', true)
on conflict (id) do nothing;

-- Create a policy to allow public read access to the bucket
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'objects' 
    and schemaname = 'storage' 
    and policyname = 'Public Access'
  ) then
    create policy "Public Access"
    on storage.objects for select
    using ( bucket_id = 'gtm-assets' );
  end if;
end
$$;

-- Create a policy to allow authenticated uploads
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'objects' 
    and schemaname = 'storage' 
    and policyname = 'Authenticated Uploads'
  ) then
    create policy "Authenticated Uploads"
    on storage.objects for insert
    with check ( bucket_id = 'gtm-assets' );
  end if;
end
$$;

-- Search RPC for GTM Assets
create or replace function match_gtm_assets (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  match_type text default null,
  use_metadata_search boolean default false
)
returns table (
  id bigint,
  name text,
  url text,
  content text,
  category text,
  tags text[],
  thumbnail_url text,
  summary text,
  created_at timestamp with time zone,
  type text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select * from (
    select 
      p.id, p.name, p.url, p.content, p.category, p.tags, p.thumbnail_url, p.summary, p.created_at,
      'PDF' as type,
      1 - (case when use_metadata_search then p.metadata_embedding else p.embedding end <=> query_embedding) as similarity
    from gtm_pdfs p
    union all
    select 
      pp.id, pp.name, pp.url, pp.content, pp.category, pp.tags, pp.thumbnail_url, pp.summary, pp.created_at,
      'PPT' as type,
      1 - (case when use_metadata_search then pp.metadata_embedding else pp.embedding end <=> query_embedding) as similarity
    from gtm_ppts pp
    union all
    select 
      w.id, w.name, w.url, w.content, w.category, w.tags, w.thumbnail_url, w.summary, w.created_at,
      'Word' as type,
      1 - (case when use_metadata_search then w.metadata_embedding else w.embedding end <=> query_embedding) as similarity
    from gtm_word_docs w
    union all
    select 
      v.id, v.name, v.url, v.content, v.category, v.tags, v.thumbnail_url, v.summary, v.created_at,
      'Video' as type,
      1 - (case when use_metadata_search then v.metadata_embedding else v.embedding end <=> query_embedding) as similarity
    from gtm_videos v
    union all
    select 
      a.id, a.name, a.url, a.content, a.category, a.tags, a.thumbnail_url, a.summary, a.created_at,
      'Audio' as type,
      1 - (case when use_metadata_search then a.metadata_embedding else a.embedding end <=> query_embedding) as similarity
    from gtm_audio a
  ) as combined_assets
  where combined_assets.similarity > match_threshold
  and (match_type is null or combined_assets.type = match_type)
  order by combined_assets.similarity desc
  limit match_count;
end;
$$;
