-- REALCHECK expanded profile fields
-- Safe to run once; adds optional fields without changing existing profile data.
alter table public.profiles
  add column if not exists headline text,
  add column if not exists location text,
  add column if not exists occupation text,
  add column if not exists interests text,
  add column if not exists languages text;

alter table public.profiles
  drop constraint if exists profiles_headline_length,
  add constraint profiles_headline_length check (headline is null or char_length(headline) <= 80),
  drop constraint if exists profiles_bio_length,
  add constraint profiles_bio_length check (bio is null or char_length(bio) <= 500),
  drop constraint if exists profiles_location_length,
  add constraint profiles_location_length check (location is null or char_length(location) <= 80),
  drop constraint if exists profiles_occupation_length,
  add constraint profiles_occupation_length check (occupation is null or char_length(occupation) <= 80),
  drop constraint if exists profiles_interests_length,
  add constraint profiles_interests_length check (interests is null or char_length(interests) <= 240),
  drop constraint if exists profiles_languages_length,
  add constraint profiles_languages_length check (languages is null or char_length(languages) <= 160);
