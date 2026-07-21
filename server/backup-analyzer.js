import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';

/**
 * Backup faylını analiz edib sayt haqqında məlumat çıxarır
 * Dəstəklənən formatlar: .zip, .wpress (All-in-One WP Migration)
 */
export function analyzeBackup(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.wpress') {
    return analyzeWpress(filePath);
  }

  // Default: ZIP analiz
  return analyzeZip(filePath);
}

/**
 * .wpress formatını analiz et (All-in-One WP Migration)
 */
function analyzeWpress(filePath) {
  const info = {
    cms: 'WordPress',
    cms_version: null,
    framework: null,
    language: 'PHP',
    php_version: null,
    node_version: null,
    database: {
      type: 'MySQL',
      name: null,
      host: null,
      prefix: null,
    },
    theme: null,
    plugins: [],
    packages: [],
    total_files: 0,
    total_size: 0,
    config_files: [],
    extra_info: { format: 'All-in-One WP Migration (.wpress)' },
  };

  try {
    const fileBuffer = fs.readFileSync(filePath);
    info.total_size = fileBuffer.length;

    // .wpress format: sıralanmış fayllardan ibarətdir
    // Hər fayl header-i: name (255 bytes) + size (14 bytes) + mtime (12 bytes) + prefix (4096 bytes)
    const HEADER_SIZE = 4377; // 255 + 14 + 12 + 4096
    let offset = 0;
    const pluginSet = new Set();
    const themeSet = new Set();
    const uploadYears = new Set();
    let mediaFiles = 0;

    // Xüsusi faylların region-larını saxla (məzmununu sonra oxuyacağıq)
    let dbSqlRegion = null;
    let packageJsonRegion = null;
    let versionPhpRegion = null;
    let htaccessRegion = null;
    let robotsRegion = null;
    const themeStyleRegions = {};   // { themeName: {start,size} }
    const pluginReadmeRegions = {};  // { slug: {start,size} }
    const pluginMainRegions = {};    // { slug: {start,size} }

    while (offset + HEADER_SIZE <= fileBuffer.length) {
      const nameRaw = fileBuffer.slice(offset, offset + 255);
      const name = nameRaw.toString('utf8').replace(/\0/g, '').trim();

      // EOF bloku (boş ad) — sonuna çatdıq
      if (!name || name.length === 0) break;

      const sizeRaw = fileBuffer.slice(offset + 255, offset + 255 + 14);
      const fileSize = parseInt(sizeRaw.toString('utf8').replace(/\0/g, '').trim(), 10) || 0;

      const prefixRaw = fileBuffer.slice(offset + 255 + 14 + 12, offset + HEADER_SIZE);
      const prefix = prefixRaw.toString('utf8').replace(/\0/g, '').trim();

      const fullPath = prefix ? `${prefix}/${name}` : name;
      const contentStart = offset + HEADER_SIZE;
      info.total_files++;

      // Plugin/tema qovluqları
      const pluginMatch = fullPath.match(/(?:^|\/)plugins\/([^/]+)/);
      if (pluginMatch) pluginSet.add(pluginMatch[1]);
      const themeMatch = fullPath.match(/(?:^|\/)themes\/([^/]+)/);
      if (themeMatch) themeSet.add(themeMatch[1]);

      // Media faylları (uploads)
      const uploadMatch = fullPath.match(/uploads\/(\d{4})\//);
      if (uploadMatch) {
        uploadYears.add(uploadMatch[1]);
        mediaFiles++;
      }

      // Xüsusi faylların yerini qeyd et
      if (name === 'database.sql' && !dbSqlRegion) {
        dbSqlRegion = { start: contentStart, size: fileSize };
      }
      if (name === 'package.json' && !prefix && !packageJsonRegion) {
        packageJsonRegion = { start: contentStart, size: fileSize };
      }
      if (name === 'version.php' && fullPath.includes('wp-includes') && !versionPhpRegion) {
        versionPhpRegion = { start: contentStart, size: fileSize };
      }
      if (name === '.htaccess' && !prefix && !htaccessRegion) {
        htaccessRegion = { start: contentStart, size: fileSize };
      }
      if (name === 'robots.txt' && !prefix && !robotsRegion) {
        robotsRegion = { start: contentStart, size: fileSize };
      }
      // Tema style.css (theme header üçün)
      if (name === 'style.css') {
        const tMatch = fullPath.match(/themes\/([^/]+)\/style\.css$/);
        if (tMatch && !themeStyleRegions[tMatch[1]]) {
          themeStyleRegions[tMatch[1]] = { start: contentStart, size: fileSize };
        }
      }
      // Plugin readme.txt (versiya üçün)
      if (name.toLowerCase() === 'readme.txt') {
        const pMatch = fullPath.match(/plugins\/([^/]+)\/readme\.txt$/i);
        if (pMatch && !pluginReadmeRegions[pMatch[1]]) {
          pluginReadmeRegions[pMatch[1]] = { start: contentStart, size: fileSize };
        }
      }
      // Plugin əsas php faylı (slug.php header üçün)
      const pMainMatch = fullPath.match(/plugins\/([^/]+)\/([^/]+)\.php$/);
      if (pMainMatch && pMainMatch[1] === pMainMatch[2] && !pluginMainRegions[pMainMatch[1]]) {
        pluginMainRegions[pMainMatch[1]] = { start: contentStart, size: Math.min(fileSize, 8192) };
      }

      offset += HEADER_SIZE + fileSize;

      if (info.total_files > 200000) {
        info.extra_info.note = 'Çox böyük arxiv — fayl sayı 200k-da dayandırıldı';
        break;
      }
    }

    const readText = (region, maxBytes) => {
      if (!region || region.size <= 0) return null;
      const sz = Math.min(region.size, maxBytes);
      return fileBuffer.slice(region.start, region.start + sz).toString('utf8');
    };

    // WP version — version.php-dən
    const versionContent = readText(versionPhpRegion, 50000);
    if (versionContent) {
      const match = versionContent.match(/\$wp_version\s*=\s*'([^']+)'/);
      if (match) info.cms_version = match[1];
      const phpReq = versionContent.match(/\$required_php_version\s*=\s*'([^']+)'/);
      if (phpReq) info.extra_info.required_php = phpReq[1];
      const mysqlReq = versionContent.match(/\$required_mysql_version\s*=\s*'([^']+)'/);
      if (mysqlReq) info.extra_info.required_mysql = mysqlReq[1];
    }

    // package.json (AI1WM metadata)
    const pkgContent = readText(packageJsonRegion, 200000);
    if (pkgContent) {
      try {
        const pkg = JSON.parse(pkgContent);
        if (pkg.WordPress?.Version) info.cms_version = info.cms_version || pkg.WordPress.Version;
        if (pkg.PHP?.Version) info.php_version = pkg.PHP.Version;
        if (pkg.Database?.Prefix) info.database.prefix = pkg.Database.Prefix;
        const sites = pkg.Sites || {};
        const firstSite = Object.keys(sites)[0];
        if (firstSite) info.extra_info.site_url = firstSite;
      } catch {}
    }

    // === database.sql analizi ===
    if (dbSqlRegion && dbSqlRegion.size > 0) {
      // Options üçün ilk 40MB (wp_options adətən əvvəldədir)
      const optSize = Math.min(dbSqlRegion.size, 40 * 1024 * 1024);
      const sql = fileBuffer.slice(dbSqlRegion.start, dbSqlRegion.start + optSize).toString('utf8');

      const getOption = (optName) => {
        const re = new RegExp(`'${optName}'\\s*,\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'i');
        const m = sql.match(re);
        return m ? m[1].replace(/\\'/g, "'").replace(/\\"/g, '"') : null;
      };

      const E = info.extra_info;
      const siteUrl = getOption('siteurl');
      const home = getOption('home');
      if (siteUrl) E.site_url = E.site_url || siteUrl;
      if (home) E.home_url = home;

      const blogName = getOption('blogname');
      if (blogName) E.site_title = blogName;
      const blogDesc = getOption('blogdescription');
      if (blogDesc) E.site_description = blogDesc;
      const adminEmail = getOption('admin_email');
      if (adminEmail) E.admin_email = adminEmail;
      const wplang = getOption('WPLANG');
      if (wplang) E.language_locale = wplang;

      // WordPress ayarları
      const tz = getOption('timezone_string');
      const gmt = getOption('gmt_offset');
      if (tz) E.timezone = tz;
      else if (gmt) E.timezone = `GMT${parseFloat(gmt) >= 0 ? '+' : ''}${gmt}`;

      const dateFmt = getOption('date_format');
      if (dateFmt) E.date_format = dateFmt;
      const timeFmt = getOption('time_format');
      if (timeFmt) E.time_format = timeFmt;
      const permalink = getOption('permalink_structure');
      if (permalink) E.permalink_structure = permalink;
      const perPage = getOption('posts_per_page');
      if (perPage) E.posts_per_page = perPage;
      const canRegister = getOption('users_can_register');
      if (canRegister !== null) E.users_can_register = canRegister === '1';
      const defaultRole = getOption('default_role');
      if (defaultRole) E.default_role = defaultRole;
      const blogPublic = getOption('blog_public');
      if (blogPublic !== null) E.search_engine_visible = blogPublic === '1';
      const commentStatus = getOption('default_comment_status');
      if (commentStatus) E.comment_status = commentStatus;
      const mailserver = getOption('mailserver_login');
      if (mailserver && mailserver !== 'login@example.com') E.mailserver_login = mailserver;

      // Tema
      const template = getOption('template');
      const stylesheet = getOption('stylesheet');
      if (stylesheet) info.theme = stylesheet;
      else if (template) info.theme = template;
      if (template && stylesheet && template !== stylesheet) {
        E.is_child_theme = true;
        E.parent_theme = template;
      }

      // Cədvəl prefiksi
      const prefixMatch = sql.match(/INSERT INTO `([a-zA-Z0-9_]+?)options`/) || sql.match(/CREATE TABLE `?([a-zA-Z0-9_]+?)options`?/);
      if (prefixMatch) info.database.prefix = info.database.prefix || prefixMatch[1];

      // Aktiv pluginlər
      const activePluginsRaw = getOption('active_plugins');
      if (activePluginsRaw) {
        const pluginPaths = [...activePluginsRaw.matchAll(/s:\d+:\\?"([^"\\]+\.php)\\?"/g)].map(m => m[1]);
        const activePlugins = pluginPaths.map(p => p.split('/')[0]);
        if (activePlugins.length > 0) E.active_plugins = [...new Set(activePlugins)];
      }

      // WooCommerce aşkarlama
      const wooCurrency = getOption('woocommerce_currency');
      if (wooCurrency) {
        E.woocommerce = true;
        E.woo_currency = wooCurrency;
        const wooCountry = getOption('woocommerce_default_country');
        if (wooCountry) E.woo_country = wooCountry;
      }

      // Say-hesab: INSERT sətirlərini saymaqla (bütün region üzərində)
      const fullSql = dbSqlRegion.size <= 60 * 1024 * 1024
        ? fileBuffer.slice(dbSqlRegion.start, dbSqlRegion.start + dbSqlRegion.size).toString('utf8')
        : sql;

      // Published posts/pages sayı
      const publishPosts = (fullSql.match(/'publish'\s*,\s*'[^']*'\s*,\s*'post'/g) || []).length;
      const publishPages = (fullSql.match(/'publish'\s*,\s*'[^']*'\s*,\s*'page'/g) || []).length;
      if (publishPosts > 0) E.published_posts = publishPosts;
      if (publishPages > 0) E.published_pages = publishPages;

      // İstifadəçi adları (wp_users) — user_login-ləri çıxar
      const usersTableMatch = fullSql.match(/INSERT INTO `[a-zA-Z0-9_]+?users`[^;]*/);
      if (usersTableMatch) {
        const usersBlock = usersTableMatch[0];
        // VALUES (id,'login','pass','nicename','email',...)
        const logins = [...usersBlock.matchAll(/\(\d+,\s*'((?:[^'\\]|\\.)*)'\s*,\s*'(?:[^'\\]|\\.)*'\s*,/g)].map(m => m[1]);
        if (logins.length > 0) {
          E.user_count = logins.length;
          E.usernames = logins.slice(0, 10);
        }
      }
    }

    // === Aktiv tema detalları (style.css header) ===
    if (info.theme && themeStyleRegions[info.theme]) {
      const styleContent = readText(themeStyleRegions[info.theme], 8192);
      if (styleContent) {
        const themeName = styleContent.match(/Theme Name:\s*(.+)/i);
        const themeVersion = styleContent.match(/Version:\s*(.+)/i);
        const themeAuthor = styleContent.match(/Author:\s*(.+)/i);
        const themeUri = styleContent.match(/Theme URI:\s*(.+)/i);
        if (themeName) info.extra_info.theme_name = themeName[1].trim();
        if (themeVersion) info.extra_info.theme_version = themeVersion[1].trim();
        if (themeAuthor) info.extra_info.theme_author = themeAuthor[1].trim().replace(/<[^>]+>/g, '');
        if (themeUri) info.extra_info.theme_uri = themeUri[1].trim();
      }
    }

    // === Aktiv plugin versiyaları ===
    const activeList = info.extra_info.active_plugins || [...pluginSet];
    const pluginDetails = [];
    for (const slug of activeList.slice(0, 40)) {
      let version = null;
      let pName = slug;
      // Əsas php faylından header
      const mainContent = readText(pluginMainRegions[slug], 8192);
      if (mainContent) {
        const vMatch = mainContent.match(/Version:\s*(.+)/i);
        if (vMatch) version = vMatch[1].trim().split(/\s/)[0];
        const nMatch = mainContent.match(/Plugin Name:\s*(.+)/i);
        if (nMatch) pName = nMatch[1].trim();
      }
      // readme.txt-dən Stable tag
      if (!version) {
        const readmeContent = readText(pluginReadmeRegions[slug], 4096);
        if (readmeContent) {
          const stable = readmeContent.match(/Stable tag:\s*(.+)/i);
          if (stable) version = stable[1].trim();
        }
      }
      pluginDetails.push({ slug, name: pName, version });
    }
    if (pluginDetails.length > 0) info.extra_info.plugin_details = pluginDetails;

    // === .htaccess və robots.txt ===
    const htaccess = readText(htaccessRegion, 8192);
    if (htaccess) {
      info.extra_info.has_htaccess = true;
      if (/RewriteEngine\s+On/i.test(htaccess)) info.extra_info.htaccess_rewrite = true;
      if (/wordpress|wp-/i.test(htaccess)) info.extra_info.htaccess_wp_rules = true;
    }
    const robots = readText(robotsRegion, 4096);
    if (robots) {
      info.extra_info.has_robots = true;
      if (/Disallow:\s*\/\s*$/im.test(robots)) info.extra_info.robots_blocking = true;
    }

    // Plugin siyahısı
    if (info.extra_info.active_plugins?.length > 0) {
      info.plugins = info.extra_info.active_plugins;
      info.extra_info.all_plugins_installed = [...pluginSet].sort();
      info.extra_info.installed_plugins_count = pluginSet.size;
    } else {
      info.plugins = [...pluginSet].sort();
    }

    // Aktiv tema hələ tapılmayıbsa qovluqdan seç
    if (!info.theme) {
      const defaultThemes = ['twentytwenty', 'twentytwentyone', 'twentytwentytwo', 'twentytwentythree', 'twentytwentyfour', 'twentytwentyfive'];
      const customThemes = [...themeSet].filter(t => !defaultThemes.includes(t));
      info.theme = customThemes[0] || [...themeSet][0] || null;
    }
    info.extra_info.all_themes = [...themeSet];
    info.extra_info.themes_count = themeSet.size;
    info.extra_info.media_files = mediaFiles;
    if (uploadYears.size > 0) {
      const years = [...uploadYears].sort();
      info.extra_info.content_years = `${years[0]} - ${years[years.length - 1]}`;
    }

    console.log(`Wpress analiz: ${info.total_files} fayl, ${info.plugins.length} aktiv plugin, tema: ${info.theme}, URL: ${info.extra_info.site_url || 'N/A'}, posts: ${info.extra_info.published_posts || 0}`);

  } catch (err) {
    console.error('Wpress analyze error:', err.message);
    info.extra_info.error = err.message;
  }

  return info;
}

/**
 * ZIP backup faylını analiz et
 */
function analyzeZip(zipPath) {
  const info = {
    cms: null,
    cms_version: null,
    framework: null,
    language: null,
    php_version: null,
    node_version: null,
    database: {
      type: null,
      name: null,
      host: null,
      prefix: null,
    },
    theme: null,
    plugins: [],
    packages: [],
    total_files: 0,
    total_size: 0,
    config_files: [],
    extra_info: {},
  };

  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries();
    info.total_files = entries.length;

    // Ümumi ölçü
    for (const entry of entries) {
      info.total_size += entry.header.size;
    }

    // Fayl adlarını topla
    const fileNames = entries.map(e => e.entryName.replace(/\\/g, '/'));

    // CMS Detection
    detectCMS(zip, entries, fileNames, info);

    // Framework Detection
    detectFramework(zip, entries, fileNames, info);

    // Database config
    extractDatabaseConfig(zip, entries, fileNames, info);

    // Plugins/Packages
    extractPluginsAndPackages(zip, entries, fileNames, info);

    // Theme detection
    detectTheme(zip, entries, fileNames, info);

    // Config files list
    info.config_files = fileNames.filter(f => {
      const base = path.basename(f).toLowerCase();
      return base.includes('config') || base.includes('.env') || 
             base === 'package.json' || base === 'composer.json' ||
             base === '.htaccess' || base === 'nginx.conf' ||
             base === 'wp-config.php' || base === 'settings.php';
    }).slice(0, 20);

  } catch (err) {
    console.error('Backup analyze error:', err.message);
    info.extra_info.error = err.message;
  }

  return info;
}

function detectCMS(zip, entries, fileNames, info) {
  // WordPress
  const wpConfig = fileNames.find(f => f.endsWith('wp-config.php'));
  if (wpConfig || fileNames.some(f => f.includes('wp-content/') || f.includes('wp-includes/'))) {
    info.cms = 'WordPress';
    info.language = 'PHP';

    // Version from wp-includes/version.php
    const versionFile = entries.find(e => e.entryName.replace(/\\/g, '/').endsWith('wp-includes/version.php'));
    if (versionFile) {
      const content = versionFile.getData().toString('utf8');
      const match = content.match(/\$wp_version\s*=\s*'([^']+)'/);
      if (match) info.cms_version = match[1];
    }
    return;
  }

  // Joomla
  if (fileNames.some(f => f.includes('components/com_') || f.endsWith('configuration.php'))) {
    info.cms = 'Joomla';
    info.language = 'PHP';
    return;
  }

  // Drupal
  if (fileNames.some(f => f.includes('sites/default/') || f.includes('core/modules/'))) {
    info.cms = 'Drupal';
    info.language = 'PHP';
    return;
  }

  // OpenCart
  if (fileNames.some(f => f.includes('catalog/controller/') || f.includes('admin/controller/'))) {
    info.cms = 'OpenCart';
    info.language = 'PHP';
    return;
  }

  // PrestaShop
  if (fileNames.some(f => f.includes('classes/shop/') || f.includes('modules/ps_'))) {
    info.cms = 'PrestaShop';
    info.language = 'PHP';
    return;
  }

  // Laravel
  if (fileNames.some(f => f.endsWith('artisan')) && fileNames.some(f => f.includes('app/Http/'))) {
    info.cms = null;
    info.framework = 'Laravel';
    info.language = 'PHP';
    return;
  }

  // Next.js
  if (fileNames.some(f => f.endsWith('next.config.js') || f.endsWith('next.config.mjs'))) {
    info.framework = 'Next.js';
    info.language = 'JavaScript/TypeScript';
    return;
  }

  // Nuxt.js
  if (fileNames.some(f => f.endsWith('nuxt.config.js') || f.endsWith('nuxt.config.ts'))) {
    info.framework = 'Nuxt.js';
    info.language = 'JavaScript/TypeScript';
    return;
  }

  // Plain PHP
  if (fileNames.some(f => f.endsWith('.php'))) {
    info.language = 'PHP';
    if (fileNames.some(f => f.includes('vendor/') && f.endsWith('composer.json'))) {
      info.framework = 'Custom PHP (Composer)';
    } else {
      info.framework = 'Custom PHP';
    }
    return;
  }

  // Static HTML
  if (fileNames.some(f => f.endsWith('.html') || f.endsWith('.htm'))) {
    info.language = 'HTML/CSS/JS';
    info.framework = 'Static Site';
    return;
  }

  // Node.js
  if (fileNames.some(f => f.endsWith('package.json'))) {
    info.language = 'JavaScript/TypeScript';
    return;
  }
}

function detectFramework(zip, entries, fileNames, info) {
  if (info.framework) return; // Already detected

  // Check package.json for JS frameworks
  const pkgEntry = entries.find(e => {
    const name = e.entryName.replace(/\\/g, '/');
    return name.endsWith('package.json') && !name.includes('node_modules/');
  });

  if (pkgEntry) {
    try {
      const content = JSON.parse(pkgEntry.getData().toString('utf8'));
      const deps = { ...content.dependencies, ...content.devDependencies };

      if (deps['next']) info.framework = 'Next.js';
      else if (deps['nuxt']) info.framework = 'Nuxt.js';
      else if (deps['react']) info.framework = 'React';
      else if (deps['vue']) info.framework = 'Vue.js';
      else if (deps['@angular/core']) info.framework = 'Angular';
      else if (deps['svelte']) info.framework = 'Svelte';
      else if (deps['express']) info.framework = 'Express.js';
      else if (deps['fastify']) info.framework = 'Fastify';

      if (content.engines?.node) info.node_version = content.engines.node;
      info.language = info.language || 'JavaScript/TypeScript';
    } catch {}
  }

  // Check composer.json for PHP frameworks
  const composerEntry = entries.find(e => {
    const name = e.entryName.replace(/\\/g, '/');
    return name.endsWith('composer.json') && !name.includes('vendor/');
  });

  if (composerEntry) {
    try {
      const content = JSON.parse(composerEntry.getData().toString('utf8'));
      const require = content.require || {};

      if (require['laravel/framework']) {
        info.framework = 'Laravel';
        info.extra_info.laravel_version = require['laravel/framework'];
      }
      else if (require['symfony/framework-bundle']) info.framework = 'Symfony';
      else if (require['codeigniter4/framework']) info.framework = 'CodeIgniter';
      else if (require['yiisoft/yii2']) info.framework = 'Yii2';
      else if (require['slim/slim']) info.framework = 'Slim';

      if (require['php']) info.php_version = require['php'];
      info.language = 'PHP';
    } catch {}
  }
}

function extractDatabaseConfig(zip, entries, fileNames, info) {
  // WordPress wp-config.php
  const wpConfig = entries.find(e => e.entryName.replace(/\\/g, '/').endsWith('wp-config.php'));
  if (wpConfig) {
    const content = wpConfig.getData().toString('utf8');
    const dbName = content.match(/define\s*\(\s*['"]DB_NAME['"]\s*,\s*['"]([^'"]+)['"]/);
    const dbHost = content.match(/define\s*\(\s*['"]DB_HOST['"]\s*,\s*['"]([^'"]+)['"]/);
    const dbPrefix = content.match(/\$table_prefix\s*=\s*['"]([^'"]+)['"]/);

    info.database.type = 'MySQL';
    if (dbName) info.database.name = dbName[1];
    if (dbHost) info.database.host = dbHost[1];
    if (dbPrefix) info.database.prefix = dbPrefix[1];
    return;
  }

  // Laravel .env
  const envFile = entries.find(e => {
    const name = path.basename(e.entryName);
    return name === '.env' || name === '.env.production' || name === '.env.local';
  });
  if (envFile) {
    const content = envFile.getData().toString('utf8');
    const dbConn = content.match(/DB_CONNECTION=(.+)/);
    const dbName = content.match(/DB_DATABASE=(.+)/);
    const dbHost = content.match(/DB_HOST=(.+)/);

    if (dbConn) info.database.type = dbConn[1].trim();
    if (dbName) info.database.name = dbName[1].trim();
    if (dbHost) info.database.host = dbHost[1].trim();
    return;
  }

  // Joomla configuration.php
  const joomlaConfig = entries.find(e => e.entryName.replace(/\\/g, '/').endsWith('configuration.php'));
  if (joomlaConfig) {
    const content = joomlaConfig.getData().toString('utf8');
    const dbName = content.match(/\$db\s*=\s*['"]([^'"]+)['"]/);
    const dbHost = content.match(/\$host\s*=\s*['"]([^'"]+)['"]/);
    const dbPrefix = content.match(/\$dbprefix\s*=\s*['"]([^'"]+)['"]/);

    info.database.type = 'MySQL';
    if (dbName) info.database.name = dbName[1];
    if (dbHost) info.database.host = dbHost[1];
    if (dbPrefix) info.database.prefix = dbPrefix[1];
  }
}

function extractPluginsAndPackages(zip, entries, fileNames, info) {
  // WordPress plugins
  if (info.cms === 'WordPress') {
    const pluginDirs = new Set();
    for (const f of fileNames) {
      const match = f.match(/wp-content\/plugins\/([^/]+)\//);
      if (match) pluginDirs.add(match[1]);
    }
    info.plugins = [...pluginDirs].sort().slice(0, 50);
    return;
  }

  // Composer packages
  const composerLock = entries.find(e => e.entryName.replace(/\\/g, '/').endsWith('composer.lock'));
  if (composerLock) {
    try {
      const content = JSON.parse(composerLock.getData().toString('utf8'));
      info.packages = (content.packages || [])
        .map(p => `${p.name}@${p.version}`)
        .slice(0, 30);
    } catch {}
    return;
  }

  // NPM packages
  const pkgLock = entries.find(e => {
    const name = e.entryName.replace(/\\/g, '/');
    return name.endsWith('package.json') && !name.includes('node_modules/');
  });
  if (pkgLock) {
    try {
      const content = JSON.parse(pkgLock.getData().toString('utf8'));
      const deps = content.dependencies || {};
      info.packages = Object.entries(deps)
        .map(([name, version]) => `${name}@${version}`)
        .slice(0, 30);
    } catch {}
  }
}

function detectTheme(zip, entries, fileNames, info) {
  // WordPress theme
  if (info.cms === 'WordPress') {
    const themes = new Set();
    for (const f of fileNames) {
      const match = f.match(/wp-content\/themes\/([^/]+)\//);
      if (match && match[1] !== 'index.php') themes.add(match[1]);
    }
    const themeList = [...themes];
    // Active theme = usually the non-default one
    info.theme = themeList.filter(t => !['twentytwenty', 'twentytwentyone', 'twentytwentytwo', 'twentytwentythree', 'twentytwentyfour'].includes(t))[0] || themeList[0] || null;
    info.extra_info.all_themes = themeList;
    return;
  }

  // Check for CSS frameworks in package.json
  const pkgEntry = entries.find(e => {
    const name = e.entryName.replace(/\\/g, '/');
    return name.endsWith('package.json') && !name.includes('node_modules/');
  });
  if (pkgEntry) {
    try {
      const content = JSON.parse(pkgEntry.getData().toString('utf8'));
      const deps = { ...content.dependencies, ...content.devDependencies };
      if (deps['tailwindcss']) info.theme = 'Tailwind CSS';
      else if (deps['bootstrap']) info.theme = 'Bootstrap';
      else if (deps['@mui/material']) info.theme = 'Material UI';
      else if (deps['antd']) info.theme = 'Ant Design';
    } catch {}
  }
}
