-- Site Factory operations schema (PostgreSQL 16), managed in Directus as the collections `sites` and `leads`.
-- One row per site is the single source of each site's runtime settings: `pnpm site:config` reads it, creates the
-- site's Umami website and Chatwoot inbox when missing, writes their ids back here and generates the site's
-- src/data/site-runtime.json. Every lead (enquiry form, chat, WhatsApp click) lands in `leads` with its site and source.

CREATE TABLE IF NOT EXISTS sites (
  id                         text PRIMARY KEY,                -- short stable id, e.g. 'strandmill'
  domain                     text NOT NULL UNIQUE,            -- bare host, e.g. 'strandmill.com'
  name                       text NOT NULL,                   -- company / brand name shown on the site
  status                     text NOT NULL DEFAULT 'building'
                             CHECK (status IN ('building', 'live', 'paused', 'retired')),
  repo                       text,                            -- e.g. 'github.com/555-site-factory/strandmill'
  deploy_path                text,                            -- e.g. '/var/www/strandmill.com'
  umami_website_id           text,                            -- written by site:config
  chatwoot_inbox_identifier  text,                            -- written by site:config (API inbox)
  indexnow_key               text,                            -- written by site:config, served as /<key>.txt
  chat_enabled               boolean NOT NULL DEFAULT true,
  whatsapp                   jsonb NOT NULL DEFAULT '[]',     -- [{"label": "Sales", "number": "+86 138 0000 0000"}]
  email                      text,                            -- the site's sales mailbox
  agent_name                 text,                            -- chat agent first name (picked from the domain when empty)
  reply_time                 text,                            -- e.g. 'Typically replies within a few hours'
  announcement               text,                            -- the header announcement bar (shown only when set)
  site_notice                text,                            -- shown on every page while paused, e.g. 'Orders resume on 1 March'
  previous_domains           jsonb NOT NULL DEFAULT '[]',     -- ["old-brand.com"]: 301 to this domain, kept at least a year
  -- Launch record: the site is set 'live' only once all of these are done.
  verification               text,                            -- how Search Console and Bing are verified, e.g. 'dns-txt'
  search_console_property    text,
  search_console_verified    boolean NOT NULL DEFAULT false,
  bing_verified              boolean NOT NULL DEFAULT false,  -- import the site into Bing Webmaster from Search Console
  sitemap_submitted_at       timestamptz,
  launched_at                timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leads (
  id              bigserial PRIMARY KEY,
  site_id         text NOT NULL REFERENCES sites (id),
  source          text NOT NULL CHECK (source IN ('form', 'chat', 'whatsapp', 'email')),
  status          text NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost', 'spam')),
  name            text,
  email           text,
  company         text,
  phone           text,
  message         text,
  page_url        text,                                        -- the page the visitor wrote from
  referrer        text,
  utm             jsonb NOT NULL DEFAULT '{}',                 -- {"utm_source": "...", "utm_medium": "...", ...}
  external_id     text,                                        -- e.g. the Chatwoot conversation id
  deal_value      numeric(12, 2),                              -- entered by hand when won
  deal_currency   text,
  received_at     timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);

CREATE INDEX IF NOT EXISTS leads_site_received ON leads (site_id, received_at DESC);
CREATE INDEX IF NOT EXISTS leads_status ON leads (status);
