export interface Check {
  id: number;
  site_id: number;
  status: 'online' | 'offline';
  http_code: number | null;
  response_time: number | null;
  ssl_valid: number | null;
  ssl_days_remaining: number | null;
  ssl_expiry: string | null;
  seo_title: string;
  seo_title_value: string | null;
  seo_description: string;
  seo_description_value: string | null;
  seo_h1: string;
  seo_robots: string | null;
  seo_canonical: string;
  server_ip: string | null;
  hosting_provider: string | null;
  domain_expiry: string | null;
  domain_registrar: string | null;
  domain_days_remaining: number | null;
  checked_at: string;
}

export interface Site {
  id: number;
  name: string;
  url: string;
  manual_domain_expiry: string | null;
  manual_domain_registrar: string | null;
  manual_hosting_expiry: string | null;
  domain_login_url: string | null;
  domain_username: string | null;
  domain_password: string | null;
  hosting_login_url: string | null;
  hosting_username: string | null;
  hosting_password: string | null;
  group_name: string | null;
  notes: string | null;
  created_at: string;
  latestCheck: Check | null;
  uptime: number | null;
}

export interface Incident {
  id: number;
  site_id: number;
  started_at: string;
  resolved_at: string | null;
  duration_seconds: number | null;
  http_code: number | null;
}

export interface SmtpSettings {
  host: string;
  port: string;
  user: string;
  pass: string;
  recipient: string;
}

export interface WebhookSettings {
  telegram_webhook: string;
  discord_webhook: string;
  discord_user_id: string;
  message_template: string;
}
