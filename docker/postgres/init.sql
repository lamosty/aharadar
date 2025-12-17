-- Initializes required extensions for Aha Radar (MVP).
-- Runs automatically on first container boot (fresh volume).

create extension if not exists pgcrypto;
create extension if not exists vector;


