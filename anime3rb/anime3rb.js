function searchResults(html) {
    const results = [];

    const titleRegex = /<h2[^>]*>(.*?)<\/h2>/;
    const hrefRegex = /<a\s+href="([^"]+)"\s*[^>]*>/;
    const imgRegex = /<img[^>]*src="([^"]+)"[^>]*>/;

    const itemRegex = /<div class="my-2 w-64[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
    const items = html.match(itemRegex) || [];

    items.forEach((itemHtml) => {
       const titleMatch = itemHtml.match(titleRegex);
       const title = titleMatch ? decodeHTMLEntities(titleMatch[1].trim()) : '';

       const hrefMatch = itemHtml.match(hrefRegex);
       const href = hrefMatch ? hrefMatch[1].trim() : '';

       const imgMatch = itemHtml.match(imgRegex);
       const imageUrl = imgMatch ? imgMatch[1].trim() : '';

       if (title && href) {
           results.push({
               title: title,
               image: imageUrl,
               href: href
           });
       }
    });
    return results;
}

function extractDetails(html) {
  const details = [];

  const containerMatch = html.match(/<div class="py-4 flex flex-col gap-2">\s*((?:<p class="sm:text-\[1\.04rem\] leading-loose text-justify">[\s\S]*?<\/p>\s*)+)<\/div>/);

  let description = "";
  if (containerMatch) {
    const pBlock = containerMatch[1];

    const pRegex = /<p class="sm:text-\[1\.04rem\] leading-loose text-justify">([\s\S]*?)<\/p>/g;
    const matches = [...pBlock.matchAll(pRegex)]
      .map(m => m[1].trim())
      .filter(text => text.length > 0); 

    description = decodeHTMLEntities(matches.join("\n\n")); 
  }

  const airdateMatch = html.match(/<td[^>]*title="([^"]+)">[^<]+<\/td>/);
  let airdate = airdateMatch ? airdateMatch[1].trim() : "";

  const genres = [];
  const aliasesMatch = html.match(
    /<div\s+class="flex flex-wrap gap-2 lg:gap-4 text-sm sm:text-\[\.94rem\] -mt-2 mb-4">([\s\S]*?)<\/div>/
  );
  const inner = aliasesMatch ? aliasesMatch[1] : "";

  const anchorRe = /<a[^>]*class="btn btn-md btn-plain !p-0"[^>]*>([^<]+)<\/a>/g;
  let m;
  while ((m = anchorRe.exec(inner)) !== null) {
    genres.push(m[1].trim());
  }

  if (description && airdate) {
    details.push({
      description: description,
      aliases: genres.join(", "),
      airdate: airdate,
    });
  }

  console.log(details);
  return details;
}


function extractEpisodes(html) {
    const episodes = [];
    const htmlRegex = /<a\s+[^>]*href="([^"]*?\/episode\/[^"]*?)"[^>]*>[\s\S]*?الحلقة\s+(\d+)[\s\S]*?<\/a>/gi;
    const plainTextRegex = /الحلقة\s+(\d+)/g;

    let matches;

    if ((matches = html.match(htmlRegex))) {
        matches.forEach(link => {
            const hrefMatch = link.match(/href="([^"]+)"/);
            const numberMatch = link.match(/الحلقة\s+(\d+)/);
            if (hrefMatch && numberMatch) {
                const href = hrefMatch[1];
                const number = numberMatch[1];
                episodes.push({
                    href: href,
                    number: number
                });
            }
        });
    } 
    else if ((matches = html.match(plainTextRegex))) {
        matches.forEach(match => {
            const numberMatch = match.match(/\d+/);
            if (numberMatch) {
                episodes.push({
                    href: null, 
                    number: numberMatch[0]
                });
            }
        });
    }

    console.log(episodes);
    return episodes;
}

async function extractStreamUrl(html) {
    try {
        const sourceMatch = html.match(/data-video-source="([^"]+)"/);
        let embedUrl = sourceMatch?.[1]?.replace(/&amp;/g, '&');
        if (!embedUrl) return null;
    
        const cinemaMatch = html.match(/url\.searchParams\.append\(\s*['"]cinema['"]\s*,\s*(\d+)\s*\)/);
        const lastMatch = html.match(/url\.searchParams\.append\(\s*['"]last['"]\s*,\s*(\d+)\s*\)/);
        const cinemaNum = cinemaMatch ? cinemaMatch[1] : undefined;
        const lastNum = lastMatch ? lastMatch[1] : undefined;
    
        if (cinemaNum) embedUrl += `&cinema=${cinemaNum}`;
        if (lastNum) embedUrl += `&last=${lastNum}`;
        embedUrl += `&next-image=undefined`;
    
        console.log('Full embed URL:', embedUrl);
    
        const response = await fetchv2(embedUrl);
        const data = await response.text();
        console.log('Embed page HTML:', data);

        const qualities = extractQualities(data);

        const epMatch = html.match(/<title>[^<]*الحلقة\s*(\d+)[^<]*<\/title>/);
        const currentEp = epMatch ? Number(epMatch[1]) : null;
    
        let nextEpNum, nextDuration, nextSubtitle;
        if (currentEp !== null) {
            const episodeRegex = new RegExp(
                `<a[^>]+href="[^"]+/episode/[^/]+/(\\d+)"[\\s\\S]*?` +
                `<span[^>]*>([^<]+)<\\/span>[\\s\\S]*?` +
                `<p[^>]*>([^<]+)<\\/p>`,
                'g'
            );
            let m;
            while ((m = episodeRegex.exec(html)) !== null) {
                const num = Number(m[1]);
                if (num > currentEp) {
                    nextEpNum = num;
                    nextDuration = m[2].trim();
                    nextSubtitle = m[3].trim();
                    break;
                }
            }
        }

        if (nextEpNum != null) {
            embedUrl += `&next-title=${encodeURIComponent(nextDuration)}`;
            embedUrl += `&next-sub-title=${encodeURIComponent(nextSubtitle)}`;
        }

        const result = {
            streams: qualities,
        }
    
        console.log('Final embed URL with all params:', qualities);
        return result;
    } catch (err) {
        console.error(err);
        return null;
    }
}
  
function extractQualities(html) {
    const match = html.match(/var\s+videos\s*=\s*(\[[\s\S]*?\]);/);
    if (!match) return [];
    
    const raw = match[1];
    const regex = /\{\s*src:\s*'([^']+)'\s*[^}]*label:\s*'([^']*)'/g;
    const list = [];
    let m;

    while ((m = regex.exec(raw)) !== null) {
        list.push(m[2], m[1]);
    }
    
    return list;
}
  

function decodeHTMLEntities(text) {
    text = text.replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

    const entities = {
        '&quot;': '"',
        '&amp;': '&',
        '&apos;': "'",
        '&lt;': '<',
        '&gt;': '>'
    };

    for (const entity in entities) {
        text = text.replace(new RegExp(entity, 'g'), entities[entity]);
    }

    return text;
}

extractStreamUrl(`<!DOCTYPE html>

<html lang="ar" dir="rtl" x-ref="html" x-init="if (true === null && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {toggleDarkMode();}" class="dark" x-bind:class="{'dark': darkMode}" x-data="{darkMode: true,sidebar: null === false ? false : null,search: null,toggleSidebar(){if(this.sidebar === null) {var rect = $refs.sidebar.getBoundingClientRect();this.sidebar = rect.left >= 0 && rect.right <= (window.innerWidth || document.documentElement.clientWidth);}this.sidebar = ! this.sidebar;Cookies.set('sidebar', this.sidebar);},toggleSearch(){if(this.search === null) {this.search = $refs.search.offsetParent !== null;}this.search = ! this.search;},toggleDarkMode(){this.darkMode = ! this.darkMode;Cookies.set('darkMode', this.darkMode);$dispatch('darkModeToggled');}}" @navigating.window="setTimeout(function() {sidebar = $refs.lg.offsetParent !== null ? null : sidebar;search = null;}, 100)">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />

    <!--[if lt IE 9]>
        <script src="https://oss.maxcdn.com/html5shiv/3.7.2/html5shiv.min.js"></script>
        <script src="https://oss.maxcdn.com/respond/1.4.2/respond.min.js"></script>
    <![endif]-->

    
    <title>أنمي Clannad الحلقة 1 مترجمة أون لاين - Anime3rb أنمي عرب</title>

    <meta name="csrf-token" content="moPRNMJSYUkQdppg76B4INpox19pqs01L8StPFIg">
    <meta itemprop="name" content="أنمي Clannad الحلقة 1 مترجمة أون لاين - Anime3rb أنمي عرب">
    <meta name="description" content="مشاهدة و تحميل أنمي Clannad الحلقة 1 اون لاين بعنوان على مسار التلال حيث ترفرف أزهار الكرز - Anime3rb أنمي عرب" />
    <meta itemprop="description" content="مشاهدة و تحميل أنمي Clannad الحلقة 1 اون لاين بعنوان على مسار التلال حيث ترفرف أزهار الكرز - Anime3rb أنمي عرب">
    <meta name="keywords" content="Anime3rb أنمي عرب,Clannad,Clannad,CLANNAD,كلاناد,الحلقة 1,أنمي عرب, anime3rb, أنيمي, hkld, مشاهدة ,تحميل ,مسلسلات ,افلام ,انمي, تحميل انمي كامل برابط واحد, أونلاين" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
    <link rel="canonical" href="https://anime3rb.com/episode/clannad/1" />
    
    <!-- twitter cards -->
	<meta name="twitter:card" content="summary"/>
	<meta name="twitter:site" content="@anime3rbcom">
	<meta name="twitter:creator" content="@anime3rbcom"/>
	<meta name="twitter:title" content="أنمي Clannad الحلقة 1 مترجمة أون لاين - Anime3rb أنمي عرب"/>
	<meta name="twitter:description" content="مشاهدة و تحميل أنمي Clannad الحلقة 1 اون لاين بعنوان على مسار التلال حيث ترفرف أزهار الكرز - Anime3rb أنمي عرب">
    <meta name="twitter:image" content="https://videos.vid3rb.com/cdn/9a01a7f6-8430-44ef-9b3a-f3a4f30ed3ff" />
    <meta name="twitter:image:alt" content="أنمي Clannad الحلقة 1 مترجمة أون لاين - Anime3rb أنمي عرب" />
	<!-- end twitter cards -->

	<!-- facebook open graph -->
	<meta property="og:site_name" content="أنمي عرب" />
	<meta property="og:locale" content="ar" />
	<meta property="og:type" content="website"/>
	<meta property="og:title" content="أنمي Clannad الحلقة 1 مترجمة أون لاين - Anime3rb أنمي عرب">
	<meta property="og:description" content="مشاهدة و تحميل أنمي Clannad الحلقة 1 اون لاين بعنوان على مسار التلال حيث ترفرف أزهار الكرز - Anime3rb أنمي عرب">
	<meta property="og:image:height" content="512" />
	<meta property="og:image:width" content="512" />
	<meta property="og:image" content="https://videos.vid3rb.com/cdn/9a01a7f6-8430-44ef-9b3a-f3a4f30ed3ff"/>
	<meta property="og:url" content="https://anime3rb.com/episode/clannad/1" />
	<!-- end facebook open graph -->

    <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png">
    <link rel="manifest" href="/favicon/site.webmanifest">
    <link rel="mask-icon" href="/favicon/safari-pinned-tab.svg" color="#5bbad5">
    <link rel="shortcut icon" href="/favicon/favicon.ico">
    <meta name="msapplication-TileColor" content="#00aba9">
    <meta name="msapplication-config" content="/favicon/browserconfig.xml">
    <meta name="theme-color" content="#2563eb">

    <!-- Fonts -->
    
    
    <style type="text/css">@font-face {font-family:IBM Plex Sans Arabic;font-style:normal;font-weight:300;src:url(/cf-fonts/s/ibm-plex-sans-arabic/5.0.18/latin/300/normal.woff2);unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;font-display:swap;}@font-face {font-family:IBM Plex Sans Arabic;font-style:normal;font-weight:300;src:url(/cf-fonts/s/ibm-plex-sans-arabic/5.0.18/latin-ext/300/normal.woff2);unicode-range:U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20CF,U+2113,U+2C60-2C7F,U+A720-A7FF;font-display:swap;}@font-face {font-family:IBM Plex Sans Arabic;font-style:normal;font-weight:300;src:url(/cf-fonts/s/ibm-plex-sans-arabic/5.0.18/arabic/300/normal.woff2);unicode-range:U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC;font-display:swap;}@font-face {font-family:IBM Plex Sans Arabic;font-style:normal;font-weight:300;src:url(/cf-fonts/s/ibm-plex-sans-arabic/5.0.18/cyrillic-ext/300/normal.woff2);unicode-range:U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;font-display:swap;}@font-face {font-family:IBM Plex Sans Arabic;font-style:normal;font-weight:400;src:url(/cf-fonts/s/ibm-plex-sans-arabic/5.0.18/latin-ext/400/normal.woff2);unicode-range:U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20CF,U+2113,U+2C60-2C7F,U+A720-A7FF;font-display:swap;}@font-face {font-family:IBM Plex Sans Arabic;font-style:normal;font-weight:400;src:url(/cf-fonts/s/ibm-plex-sans-arabic/5.0.18/latin/400/normal.woff2);unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;font-display:swap;}@font-face {font-family:IBM Plex Sans Arabic;font-style:normal;font-weight:400;src:url(/cf-fonts/s/ibm-plex-sans-arabic/5.0.18/arabic/400/normal.woff2);unicode-range:U+0600-06FF,U+0750-077F,U+0870-088E,U+0890-0891,U+0898-08E1,U+08E3-08FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FE74,U+FE76-FEFC;font-display:swap;}@font-face {font-family:IBM Plex Sans Arabic;font-style:normal;font-weight:400;src:url(/cf-fonts/s/ibm-plex-sans-arabic/5.0.18/cyrillic-ext/400/normal.woff2);unicode-range:U+0460-052F,U+1C80-1C88,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F;font-display:swap;}</style>

    <link rel="preload" as="style" href="https://anime3rb.com/build/assets/main-ed6f67a2.css" /><link rel="stylesheet" href="https://anime3rb.com/build/assets/main-ed6f67a2.css" data-navigate-track="reload" />
    <link rel="modulepreload" href="https://anime3rb.com/build/assets/main-dec0d113.js" /><script type="module" src="https://anime3rb.com/build/assets/main-dec0d113.js" data-navigate-track="reload"></script>
    <!-- Livewire Styles --><style >[wire\:loading][wire\:loading], [wire\:loading\.delay][wire\:loading\.delay], [wire\:loading\.inline-block][wire\:loading\.inline-block], [wire\:loading\.inline][wire\:loading\.inline], [wire\:loading\.block][wire\:loading\.block], [wire\:loading\.flex][wire\:loading\.flex], [wire\:loading\.table][wire\:loading\.table], [wire\:loading\.grid][wire\:loading\.grid], [wire\:loading\.inline-flex][wire\:loading\.inline-flex] {display: none;}[wire\:loading\.delay\.none][wire\:loading\.delay\.none], [wire\:loading\.delay\.shortest][wire\:loading\.delay\.shortest], [wire\:loading\.delay\.shorter][wire\:loading\.delay\.shorter], [wire\:loading\.delay\.short][wire\:loading\.delay\.short], [wire\:loading\.delay\.default][wire\:loading\.delay\.default], [wire\:loading\.delay\.long][wire\:loading\.delay\.long], [wire\:loading\.delay\.longer][wire\:loading\.delay\.longer], [wire\:loading\.delay\.longest][wire\:loading\.delay\.longest] {display: none;}[wire\:offline][wire\:offline] {display: none;}[wire\:dirty]:not(textarea):not(input):not(select) {display: none;}:root {--livewire-progress-bar-color: #2299dd;}[x-cloak] {display: none !important;}[wire\:cloak] {display: none !important;}</style>
</head>
<body class="font-sans antialiased text-gray-800 dark:text-dark-200 flex flex-col bg-gray-100 dark:bg-dark-800 dark:border-dark-700 min-h-screen rtl:text-right rtl:dir text-sm lg:text-base relative">
    <!-- Header -->
<div x-data="{resize: () => $el.style.height = $refs.header.offsetHeight + 'px'}" @resize.window="resize" x-init="resize"></div>

<header class="sticky top-0 w-full z-20" x-ref="header" x-init="$el.classList.remove('sticky');$el.classList.add('fixed');">
    <!-- NavBar -->
    <nav class="bg-white dark:bg-dark-800 border-b dark:border-dark-700/50 mx-auto px-2 py-3 md:ps-4 md:pe-6 md:py-4">
        <div class="flex gap-3 sm:gap-4 lg:gap-6 justify-between items-center flex-wrap">
            <div class="flex items-center">
                                    <button type="submit" class="btn btn-md btn-plain !px-3 dark:!bg-dark-800 dark:hover:!brightness-125 dark:active:!brightness-125 dark:focus:!brightness-125" @click.prevent="toggleSidebar">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-7 w-7 inline" fill="none" stroke-width="2">
    <path d="M4 6h16M4 12h16M4 18h16" />
</svg>                        <span class="sr-only">إظهار القائمة الجانبية</span>
</button>
                
                <!-- Logo -->
                <a  href="https://anime3rb.com" class="btn btn-md btn-plain !rounded-none !p-2 overflow-hidden max-[420px]:hidden text-xl font-bold tracking-wide uppercase text-primary-500 hover:text-primary-600 focus:text-primary-600">
    <img src="https://anime3rb.com/images/logo.png" loading="lazy" class="dark:brightness-200" width="120" height="30" alt="لوجو أنمي عرب" />
</a>

                <!-- End Logo -->

                <nav class="lg:ms-2 xl:ms-6 hidden md:flex">
                    <a  href="https://anime3rb.com/titles/list" class="btn btn-md btn-link md:hidden xl:inline">
    قائمة الأنمي
</a>


                    <a  href="https://anime3rb.com/premium" class="btn btn-md btn-link">
    الإشتراك المميز
</a>

                </nav>
            </div>
            
            <div class="flex flex-row-reverse gap-2 md:gap-3 flex-grow lg:flex-grow-0 order-2 items-center">
                                    <div class="dropdown-wrapper sm:relative" x-data="{ open: false }" 
    @click.away="open = false" 
    @close.stop="open = false"
    x-trap.inert="open"
    @keydown.down="$focus.wrap().next()"
    @keydown.up="$focus.wrap().previous()"
>
    <div class="flex-grow flex flex-wrap" @click="open = ! open">
        <button type="submit" class="btn btn-md btn-light !rounded-full aspect-square w-11 h-11 !p-0 flex items-center justify-center">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline" fill="none" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
</svg>                                <span class="sr-only">قائمة المستخدم</span>
</button>
    </div>

    <div x-show="open"
            x-transition:enter="transition ease-out duration-200"
            x-transition:enter-start="transform opacity-0 scale-95"
            x-transition:enter-end="transform opacity-100 scale-100"
            x-transition:leave="transition ease-in duration-75"
            x-transition:leave-start="transform opacity-100 scale-100"
            x-transition:leave-end="transform opacity-0 scale-95"
            class="dropdown origin-top-right right-0 rtl:origin-top-left rtl:left-0 rtl:right-auto w-full sm:w-48 max-h-[calc(100vh-80px)] overflow-y-auto"
            style="display: none;">
        <div class="dropdown-content ">
            <a  href="https://anime3rb.com/login" class="btn btn-md btn-primary inline-block w-full !rounded-none !px-6 !py-4">
    تسجيل الدخول
</a>

                                <a  href="https://anime3rb.com/register" class="btn btn-md btn-white inline-block w-full !rounded-none !px-6 !py-4">
    حساب جديد
</a>
        </div>
    </div>
</div>
                
                                    <div class="dropdown-wrapper md:relative" x-data="{ open: false }" 
    @click.away="open = false" 
    @close.stop="open = false"
    x-trap.inert="open"
    @keydown.down="$focus.wrap().next()"
    @keydown.up="$focus.wrap().previous()"
>
    <div class="flex-grow flex flex-wrap" @click="open = ! open">
        <button wire:snapshot="{&quot;data&quot;:[],&quot;memo&quot;:{&quot;id&quot;:&quot;8yW4S0pEFx7x9PBcJHSL&quot;,&quot;name&quot;:&quot;notification.notifications-icon&quot;,&quot;path&quot;:&quot;episode\/clannad\/1&quot;,&quot;method&quot;:&quot;GET&quot;,&quot;children&quot;:[],&quot;scripts&quot;:[],&quot;assets&quot;:[],&quot;errors&quot;:[],&quot;locale&quot;:&quot;ar&quot;},&quot;checksum&quot;:&quot;b6e2fd48b5ab1590eaf3a478ab06be95307ea4173920da883f78c3465e03358d&quot;}" wire:effects="{&quot;listeners&quot;:[&quot;notifications-read&quot;]}" wire:id="8yW4S0pEFx7x9PBcJHSL" type="submit" class="btn btn-md btn-light !rounded-full aspect-square w-11 h-11 !p-0 flex items-center justify-center relative">
    <div class="w-7 h-7 flex items-center justify-center overflow-hidden rounded-full text-white text-sm bg-red-400 absolute -top-2 -right-2 pulse">1</div>
        <span class="sr-only">الإشعارات</span>
    
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-6 !h-6" fill="none" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
</svg>
</button>
    </div>

    <div x-show="open"
            x-transition:enter="transition ease-out duration-200"
            x-transition:enter-start="transform opacity-0 scale-95"
            x-transition:enter-end="transform opacity-100 scale-100"
            x-transition:leave="transition ease-in duration-75"
            x-transition:leave-start="transform opacity-100 scale-100"
            x-transition:leave-end="transform opacity-0 scale-95"
            class="dropdown origin-top-right right-0 rtl:origin-top-left rtl:left-0 rtl:right-auto w-full md:w-screen md:max-w-xl h-[600px] md:max-h-[calc(100vh-80px)] overflow-y-scroll bg-white dark:bg-dark-700 max-h-[calc(100vh-80px)] overflow-y-auto"
            style="display: none;">
        <div class="dropdown-content !ring-0">
            <a  class="flex items-center gap-2 w-full px-4 py-3 text-left text-[.92rem] leading-5 text-gray-700 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-800/30 focus:outline-none focus:bg-gray-100 dark:focus:bg-dark-800/30 transition duration-150 ease-in-out first-of-type:flex dark:border-dark-600/40 !px-4 !py-20 hidden flex-col justify-center gap-6" href="#"><svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-12 !h-12" fill="none" stroke-width="1">
    <path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
</svg>                                    قم بتسجيل الدخول لتلقي الإشعارات</a>
        </div>
    </div>
</div>
                                
                <button type="submit" class="btn btn-md btn-light !rounded-full aspect-square w-11 h-11 !p-0 flex items-center justify-center" @click="toggleDarkMode">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5" fill="none" stroke-width="1.5" x-cloak="x-cloak" x-show="! darkMode">
    <path stroke-linecap="round" stroke-linejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
</svg>
                          <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5" fill="none" stroke-width="1.5" x-cloak="x-cloak" x-show="darkMode">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
</svg>
                    <span class="sr-only">تبديل الوضع الليلي</span>
</button>

                

                
            </div>

                            <div class="lg:hidden">
                    <button type="submit" class="btn btn-md btn-light !rounded-full aspect-square w-11 h-11 !p-0 flex items-center justify-center" @click="toggleSearch">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5" fill="none" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
</svg>
                          <span class="sr-only">إظهار شريط البحث</span>
</button>
                </div>
                
                <div class="hidden lg:!flex flex-grow justify-center order-3 lg:order-1 w-full lg:w-auto" x-ref="search" x-bind:class="search === true ? '!flex' : ''">
                    <form wire:snapshot="{&quot;data&quot;:{&quot;query&quot;:&quot;&quot;,&quot;deep&quot;:false,&quot;paginators&quot;:[[],{&quot;s&quot;:&quot;arr&quot;}]},&quot;memo&quot;:{&quot;id&quot;:&quot;SeYLa4qCCLYVnIrU09Bz&quot;,&quot;name&quot;:&quot;search&quot;,&quot;path&quot;:&quot;episode\/clannad\/1&quot;,&quot;method&quot;:&quot;GET&quot;,&quot;children&quot;:[],&quot;scripts&quot;:[],&quot;assets&quot;:[],&quot;errors&quot;:[],&quot;locale&quot;:&quot;ar&quot;},&quot;checksum&quot;:&quot;8334d27f91b22e7249be4e0462ee59263cf09810349117d559f915fc0425ceeb&quot;}" wire:effects="{&quot;xjs&quot;:[{&quot;expression&quot;:&quot;document.querySelector(\&quot;.search-results\&quot;).scrollTo(0, 0)&quot;,&quot;params&quot;:[]}]}" wire:id="SeYLa4qCCLYVnIrU09Bz" class="relative flex-grow w-full lg:w-auto lg:max-w-2xl xl:max-w-4xl" 
    action="https://anime3rb.com/search"
    x-data="{
        searchResultVisible: false,
        open(){ 
            this.searchResultVisible = true
        },
        close(){ 
            this.searchResultVisible = false
            search = null
        },
    }"
    @click="open"
    @click.outside="searchResultVisible ? close() : ''"
    @keyup.escape.window="searchResultVisible ? close() : ''"
    x-init="$watch('search', value => setTimeout(() => searchResultVisible = value, 1))"
>
    
    <div class="bg-dark-900/60 fixed top-0 bottom-0 left-0 right-0"
        x-cloak x-show="searchResultVisible" x-transition.opacity @click.stop="close"></div>
    
    <button class="absolute top-2.5 left-2 rtl:left-auto rtl:right-2 z-[1] outline-none cursor-pointer text-primary-500 hover:text-primary-700 focus:text-primary-700 dark:text-dark-400 py-1 px-2">
        <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5" fill="none" stroke-width="1.5" wire:loading.remove="">
    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
</svg>
          <svg class="inline w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-primary-600 dark:fill-gray-200 !w-5 !h-5" x-cloak="x-cloak" wire:loading="" aria-hidden="true" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"></path>
    <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"></path>
</svg>
        <span class="sr-only">بحث</span>
    </button>

    <div x-trap.inert.noscroll="searchResultVisible;"
        @keydown.down="$focus.wrap().next()"
        @keydown.up="$focus.wrap().previous()"
    >
        <input  type="search" class="input-solid relative focus:!bg-gray-100/95 dark:focus:!bg-dark-700 focus:!border-transparent p-3 w-full pl-12 rtl:pl-3 rtl:pr-12" name="q" id="query" placeholder="بحث..." wire:model.live.debounce.750ms="query" value="" @input="open" x-bind:class="searchResultVisible ? '!rounded-b-none' : ''" autocomplete="off">

        <div class="search-results absolute bg-white dark:bg-dark-750 w-full shadow-xl rounded-b-lg divide-y overflow-hidden max-h-[480px] overflow-y-auto"
            x-cloak x-bind:class="searchResultVisible ? 'block' : 'hidden'">
                            <div class="px-6 py-6 dark:border-dark-600/70">
                                            <p>ما الذي ترغب بالبحث عنه ؟.</p>
                                                        </div>
            
                    </div>
    </div>
</form>
                </div>
                    </div>
    </nav>
    <!-- End NavBar -->
</header>
<!-- End Header -->

    <noscript>
        <p class="container mx-auto text-center p-6">
            من فضلك قم بتفعيل الجافاسكريبت لكي يعمل الموقع بشكل صحيح.
        </p>
    </noscript>
    
    <div class="flex flex-grow h-full bg-gray-100 dark:bg-dark-800 relative">
                    <div x-cloak class="bg-dark-900/60 z-10 w-full h-full absolute xl:hidden" @click="sidebar = false" x-show="sidebar"></div>

<div class="absolute xl:hidden" x-ref="lg"></div>

<div class="w-72 xl:w-64 2xl:w-80 max-w-[90%] h-full pb-32 shrink-0 dark:bg-dark-800 -translate-x-full rtl:translate-x-full xl:translate-x-0 transition-all duration-300 overflow-x-hidden absolute xl:relative " x-bind:class="{
    '!translate-x-0': sidebar !== null && sidebar,
    '!w-0': sidebar !== null && !sidebar,
}"></div>

<aside class="w-72 xl:w-64 2xl:w-80 max-w-[90%] h-full pb-32 shrink-0 bg-white dark:bg-dark-800 border-r rtl:border-l dark:border-dark-700/50 -translate-x-full rtl:translate-x-full xl:translate-x-0 rtl:xl:translate-x-0 shadow z-10 transition-transform duration-300 overflow-x-hidden fixed " x-bind:class="{
    '!translate-x-0': sidebar !== null && sidebar,
    '!-translate-x-full rtl:!translate-x-full': sidebar !== null && !sidebar
}" x-ref="sidebar" x-trap.inert.noscroll="sidebar && ($refs.lg.offsetParent !== null)">
    <div class="w-full flex flex-col">
        <!-- Logo -->
        <a  href="https://anime3rb.com" class="btn btn-md btn-plain min-[421px]:hidden text-xl font-bold tracking-wide uppercase text-primary-500 hover:text-primary-600 focus:text-primary-600 !px-8 !py-5 flex justify-center">
    <img src="https://anime3rb.com/images/logo.png" loading="lazy" class="dark:brightness-200" width="120" height="30" alt="لوجو أنمي عرب" />
</a>

        <!-- End Logo -->

        <a  href="https://anime3rb.com/premium" class="btn btn-md btn-link !px-8 !py-5 !rounded-none flex gap-2 items-center justify-between bg-yellow-50 dark:bg-dark-700/30">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline text-yellow-400" fill="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
</svg>
            الإشتراك المميز
            <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline text-yellow-400" fill="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
</svg>
</a>


        <a  href="https://anime3rb.com/titles/list" class="btn btn-md btn-link !px-8 !py-3 !rounded-none">
    قائمة الأنمي
</a>

        
                    <a  href="https://anime3rb.com/titles/list/tv" class="btn btn-md btn-link !px-8 !py-3 !rounded-none">
    قائمة مسلسلات الأنمي
</a>

                    <a  href="https://anime3rb.com/titles/list/movie" class="btn btn-md btn-link !px-8 !py-3 !rounded-none">
    قائمة أفلام الأنمي
</a>

                    <a  href="https://anime3rb.com/titles/list/ova" class="btn btn-md btn-link !px-8 !py-3 !rounded-none">
    قائمة الأوفا
</a>

                    <a  href="https://anime3rb.com/titles/list/ona" class="btn btn-md btn-link !px-8 !py-3 !rounded-none">
    قائمة الأونا
</a>

                    <a  href="https://anime3rb.com/titles/list/special" class="btn btn-md btn-link !px-8 !py-3 !rounded-none">
    حلقات الأنمي الخاصة
</a>

                    <a  href="https://anime3rb.com/titles/list/tv-special" class="btn btn-md btn-link !px-8 !py-3 !rounded-none">
    حلقات خاصة تلفزيونية
</a>

                    <a  href="https://anime3rb.com/titles/list/music" class="btn btn-md btn-link !px-8 !py-3 !rounded-none">
    عروض موسيقية
</a>

                    <a  href="https://anime3rb.com/titles/list/cm" class="btn btn-md btn-link !px-8 !py-3 !rounded-none">
    عروض إعلانية
</a>

                    <a  href="https://anime3rb.com/titles/list/pv" class="btn btn-md btn-link !px-8 !py-3 !rounded-none">
    عروض ترويجية
</a>

                    <a  href="https://anime3rb.com/titles/list/unknown" class="btn btn-md btn-link !px-8 !py-3 !rounded-none">
    عروض أخرى
</a>

        
        <div class="flex flex-col gap-4 items-center justify-center bg-primary-900/5 dark:bg-dark-700/30 p-6 my-3">
            تابعنا
            <div class="flex flex-wrap gap-3 justify-center items-center" dir="ltr">
    <a  href="https://facebook.com/anime3rb" class="btn btn-md btn-white !p-0 !w-12 !h-12 flex items-center justify-center !rounded-full" target="_blank" rel="noreferrer noopener nofollow" title="فيس بوك">
    <svg viewBox="0 0 512 512" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5 text-[#1877f2] dark:text-white" fill="none" stroke-width="1.5">
    <path d="M374.245,285.825l14.104,-91.961l-88.233,0l0,-59.677c0,-25.159 12.325,-49.682 51.845,-49.682l40.117,0l0,-78.291c0,0 -36.408,-6.214 -71.214,-6.214c-72.67,0 -120.165,44.042 -120.165,123.775l0,70.089l-80.777,0l0,91.961l80.777,0l0,222.31c16.197,2.542 32.798,3.865 49.709,3.865c16.911,0 33.512,-1.323 49.708,-3.865l0,-222.31l74.129,0Z" style="fill:currentColor;fill-rule:nonzero;"/>
</svg>
        <span class="sr-only">فيس بوك</span>
</a>

    <a  href="https://twitter.com/anime3rbcom" class="btn btn-md btn-white !p-0 !w-12 !h-12 flex items-center justify-center !rounded-full" target="_blank" rel="noreferrer noopener nofollow" title="إكس (تويتر سابقا)">
    <svg version="1.1" viewBox="0 0 256 256" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5 dark:text-white" fill="none" stroke-width="1.5">
    <g style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: none; fill-rule: nonzero; opacity: 1;" transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)" >
        <path d="M 0.219 2.882 l 34.748 46.461 L 0 87.118 h 7.87 l 30.614 -33.073 l 24.735 33.073 H 90 L 53.297 38.043 L 85.844 2.882 h -7.87 L 49.781 33.341 L 27.001 2.882 H 0.219 z M 11.793 8.679 h 12.303 L 78.425 81.32 H 66.122 L 11.793 8.679 z" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: currentColor; fill-rule: nonzero; opacity: 1;" transform=" matrix(1 0 0 1 0 0) " stroke-linecap="round" />
    </g>
</svg>
        <span class="sr-only">إكس (تويتر سابقا)</span>
</a>

    <a  href="https://patreon.com/anime3rb/membership" class="btn btn-md btn-white !p-0 !w-12 !h-12 flex items-center justify-center !rounded-full" target="_blank" rel="noreferrer noopener nofollow" title="باتريون">
    <svg viewBox="0 0 245.53 268.91" stroke="currentColor" fill="currentColor" class="h-6 w-6 inline !w-5 !h-5 dark:text-white">
    <path d="M506.76,330.33c0-34.34-26.79-62.48-58.16-72.63-39-12.61-90.35-10.78-127.55,6.77-45.09,21.28-59.26,67.89-59.78,114.37-.43,38.22,3.38,138.88,60.16,139.6,42.19.54,48.47-53.83,68-80,13.89-18.63,31.77-23.89,53.78-29.34C481,399.74,506.82,369.88,506.76,330.33Z" transform="translate(-261.24 -249.55)"/>
</svg>
        <span class="sr-only">باتريون</span>
</a>

</div>
        </div>

        <span class="text-[0.92rem] px-10 py-3 opacity-70 font-light">التصنيفات</span>

        <div wire:snapshot="{&quot;data&quot;:{&quot;genres&quot;:[null,{&quot;keys&quot;:[1,4,9,2,7,33,28,26,29,39,30,22,8,13,61,35,19,38,77,20,37,43,31,25,49,48,14,21,45,18,23,36,44,42,68,50,16,74,52,87,41,69,27,76,59,15,64,47,53,58,66,79,63,73,46,60,67,75,62,81,83,56,51,55,80,65,88,71,54,72,85,84,78,86,82,70,89],&quot;class&quot;:&quot;Illuminate\\Database\\Eloquent\\Collection&quot;,&quot;modelClass&quot;:&quot;App\\Models\\Genre&quot;,&quot;s&quot;:&quot;elcln&quot;}]},&quot;memo&quot;:{&quot;id&quot;:&quot;GsxyxeQEdqkN104Q9dLd&quot;,&quot;name&quot;:&quot;genres&quot;,&quot;path&quot;:&quot;episode\/clannad\/1&quot;,&quot;method&quot;:&quot;GET&quot;,&quot;children&quot;:[],&quot;scripts&quot;:[],&quot;assets&quot;:[],&quot;errors&quot;:[],&quot;locale&quot;:&quot;ar&quot;},&quot;checksum&quot;:&quot;09c08605946524914db427b38d2f0d46559d1b34cb2aa3d0f2c9f036c0a3e4bb&quot;}" wire:effects="[]" wire:id="GsxyxeQEdqkN104Q9dLd">
            <a  href="https://anime3rb.com/genre/action" class="btn btn-md btn-link genre">
    أكشن
            <span class="badge">2364</span>
</a>

            <a  href="https://anime3rb.com/genre/comedy" class="btn btn-md btn-link genre">
    كوميدي
            <span class="badge">2148</span>
</a>

            <a  href="https://anime3rb.com/genre/fantasy" class="btn btn-md btn-link genre">
    خيال
            <span class="badge">1653</span>
</a>

            <a  href="https://anime3rb.com/genre/adventure" class="btn btn-md btn-link genre">
    مغامرة
            <span class="badge">1336</span>
</a>

            <a  href="https://anime3rb.com/genre/drama" class="btn btn-md btn-link genre">
    دراما
            <span class="badge">1329</span>
</a>

            <a  href="https://anime3rb.com/genre/shounen" class="btn btn-md btn-link genre">
    شونين
            <span class="badge">1283</span>
</a>

            <a  href="https://anime3rb.com/genre/school" class="btn btn-md btn-link genre">
    مدرسي
            <span class="badge">1175</span>
</a>

            <a  href="https://anime3rb.com/genre/romance" class="btn btn-md btn-link genre">
    رومانسي
            <span class="badge">1169</span>
</a>

            <a  href="https://anime3rb.com/genre/sci-fi" class="btn btn-md btn-link genre">
    خيال علمي
            <span class="badge">1156</span>
</a>

            <a  href="https://anime3rb.com/genre/supernatural" class="btn btn-md btn-link genre">
    خارق للطبيعة
            <span class="badge">651</span>
</a>

            <a  href="https://anime3rb.com/genre/seinen" class="btn btn-md btn-link genre">
    سينين
            <span class="badge">642</span>
</a>

            <a  href="https://anime3rb.com/genre/mystery" class="btn btn-md btn-link genre">
    غموض
            <span class="badge">578</span>
</a>

            <a  href="https://anime3rb.com/genre/ecchi" class="btn btn-md btn-link genre">
    إيتشي
            <span class="badge">475</span>
</a>

            <a  href="https://anime3rb.com/genre/historical" class="btn btn-md btn-link genre">
    تاريخي
            <span class="badge">438</span>
</a>

            <a  href="https://anime3rb.com/genre/adult-cast" class="btn btn-md btn-link genre">
    بطولة راشدين
            <span class="badge">430</span>
</a>

            <a  href="https://anime3rb.com/genre/slice-of-life" class="btn btn-md btn-link genre">
    الحياة اليومية
            <span class="badge">402</span>
</a>

            <a  href="https://anime3rb.com/genre/mecha" class="btn btn-md btn-link genre">
    ميكا
            <span class="badge">386</span>
</a>

            <a  href="https://anime3rb.com/genre/super-power" class="btn btn-md btn-link genre">
    قوى خارقة
            <span class="badge">377</span>
</a>

            <a  href="https://anime3rb.com/genre/harem" class="btn btn-md btn-link genre">
    حريم
            <span class="badge">346</span>
</a>

            <a  href="https://anime3rb.com/genre/military" class="btn btn-md btn-link genre">
    عسكري
            <span class="badge">324</span>
</a>

            <a  href="https://anime3rb.com/genre/sports" class="btn btn-md btn-link genre">
    رياضي
            <span class="badge">304</span>
</a>

            <a  href="https://anime3rb.com/genre/suspense" class="btn btn-md btn-link genre">
    تشويق
            <span class="badge">294</span>
</a>

            <a  href="https://anime3rb.com/genre/shoujo" class="btn btn-md btn-link genre">
    شوچو
            <span class="badge">271</span>
</a>

            <a  href="https://anime3rb.com/genre/psychological" class="btn btn-md btn-link genre">
    نفسي
            <span class="badge">260</span>
</a>

            <a  href="https://anime3rb.com/genre/mythology" class="btn btn-md btn-link genre">
    أساطير
            <span class="badge">260</span>
</a>

            <a  href="https://anime3rb.com/genre/isekai" class="btn btn-md btn-link genre">
    إيسيكاي
            <span class="badge">259</span>
</a>

            <a  href="https://anime3rb.com/genre/horror" class="btn btn-md btn-link genre">
    رعب
            <span class="badge">233</span>
</a>

            <a  href="https://anime3rb.com/genre/music" class="btn btn-md btn-link genre">
    موسيقى
            <span class="badge">209</span>
</a>

            <a  href="https://anime3rb.com/genre/gore" class="btn btn-md btn-link genre">
    دموي
            <span class="badge">205</span>
</a>

            <a  href="https://anime3rb.com/genre/martial-arts" class="btn btn-md btn-link genre">
    قتالي
            <span class="badge">189</span>
</a>

            <a  href="https://anime3rb.com/genre/parody" class="btn btn-md btn-link genre">
    ساخر
            <span class="badge">186</span>
</a>

            <a  href="https://anime3rb.com/genre/space" class="btn btn-md btn-link genre">
    فضاء
            <span class="badge">178</span>
</a>

            <a  href="https://anime3rb.com/genre/detective" class="btn btn-md btn-link genre">
    بوليسي
            <span class="badge">178</span>
</a>

            <a  href="https://anime3rb.com/genre/award-winning" class="btn btn-md btn-link genre">
    حائز على جوائز
            <span class="badge">166</span>
</a>

            <a  href="https://anime3rb.com/genre/cgdct" class="btn btn-md btn-link genre">
    كيوت
            <span class="badge">158</span>
</a>

            <a  href="https://anime3rb.com/genre/team-sports" class="btn btn-md btn-link genre">
    رياضات جماعية
            <span class="badge">143</span>
</a>

            <a  href="https://anime3rb.com/genre/kids" class="btn btn-md btn-link genre">
    للأطفال
            <span class="badge">133</span>
</a>

            <a  href="https://anime3rb.com/genre/gag-humor" class="btn btn-md btn-link genre">
    كوميديا حركية
            <span class="badge">127</span>
</a>

            <a  href="https://anime3rb.com/genre/iyashikei" class="btn btn-md btn-link genre">
    إياشيكي
            <span class="badge">126</span>
</a>

            <a  href="https://anime3rb.com/genre/urban-fantasy" class="btn btn-md btn-link genre">
    خيال حضري
            <span class="badge">115</span>
</a>

            <a  href="https://anime3rb.com/genre/vampire" class="btn btn-md btn-link genre">
    مصاصي دماء
            <span class="badge">113</span>
</a>

            <a  href="https://anime3rb.com/genre/workplace" class="btn btn-md btn-link genre">
    عمل
            <span class="badge">113</span>
</a>

            <a  href="https://anime3rb.com/genre/samurai" class="btn btn-md btn-link genre">
    ساموراي
            <span class="badge">110</span>
</a>

            <a  href="https://anime3rb.com/genre/mahou-shoujo" class="btn btn-md btn-link genre">
    فتاة ساحرة
            <span class="badge">110</span>
</a>

            <a  href="https://anime3rb.com/genre/anthropomorphic" class="btn btn-md btn-link genre">
    أنثروبولوجي
            <span class="badge">105</span>
</a>

            <a  href="https://anime3rb.com/genre/josei" class="btn btn-md btn-link genre">
    چوسي
            <span class="badge">92</span>
</a>

            <a  href="https://anime3rb.com/genre/reincarnation" class="btn btn-md btn-link genre">
    تناسخ و إعادة إحياء
            <span class="badge">92</span>
</a>

            <a  href="https://anime3rb.com/genre/time-travel" class="btn btn-md btn-link genre">
    سفر عبر الزمن
            <span class="badge">91</span>
</a>

            <a  href="https://anime3rb.com/genre/strategy-game" class="btn btn-md btn-link genre">
    استراتيجي
            <span class="badge">89</span>
</a>

            <a  href="https://anime3rb.com/genre/love-polygon" class="btn btn-md btn-link genre">
    حب متعدد الأطراف
            <span class="badge">82</span>
</a>

            <a  href="https://anime3rb.com/genre/otaku-culture" class="btn btn-md btn-link genre">
    ثقافة الأوتاكو
            <span class="badge">80</span>
</a>

            <a  href="https://anime3rb.com/genre/idols-female" class="btn btn-md btn-link genre">
    أيدول إناث
            <span class="badge">68</span>
</a>

            <a  href="https://anime3rb.com/genre/organized-crime" class="btn btn-md btn-link genre">
    جريمة منظمة
            <span class="badge">65</span>
</a>

            <a  href="https://anime3rb.com/genre/video-game" class="btn btn-md btn-link genre">
    ألعاب فيديو
            <span class="badge">64</span>
</a>

            <a  href="https://anime3rb.com/genre/survival" class="btn btn-md btn-link genre">
    نجاة
            <span class="badge">63</span>
</a>

            <a  href="https://anime3rb.com/genre/gourmet" class="btn btn-md btn-link genre">
    طعام
            <span class="badge">61</span>
</a>

            <a  href="https://anime3rb.com/genre/performing-arts" class="btn btn-md btn-link genre">
    فنون استعراضية
            <span class="badge">52</span>
</a>

            <a  href="https://anime3rb.com/genre/reverse-harem" class="btn btn-md btn-link genre">
    عكس حريم
            <span class="badge">51</span>
</a>

            <a  href="https://anime3rb.com/genre/avant-garde" class="btn btn-md btn-link genre">
    ابتكاري
            <span class="badge">50</span>
</a>

            <a  href="https://anime3rb.com/genre/girls-love" class="btn btn-md btn-link genre">
    حب فتيات
            <span class="badge">50</span>
</a>

            <a  href="https://anime3rb.com/genre/racing" class="btn btn-md btn-link genre">
    سباق
            <span class="badge">49</span>
</a>

            <a  href="https://anime3rb.com/genre/combat-sports" class="btn btn-md btn-link genre">
    رياضات قتالية
            <span class="badge">48</span>
</a>

            <a  href="https://anime3rb.com/genre/childcare" class="btn btn-md btn-link genre">
    رعاية أطفال
            <span class="badge">45</span>
</a>

            <a  href="https://anime3rb.com/genre/visual-arts" class="btn btn-md btn-link genre">
    فنون بصرية
            <span class="badge">41</span>
</a>

            <a  href="https://anime3rb.com/genre/high-stakes-game" class="btn btn-md btn-link genre">
    ألعاب عالية المخاطر
            <span class="badge">40</span>
</a>

            <a  href="https://anime3rb.com/genre/delinquents" class="btn btn-md btn-link genre">
    جانحون
            <span class="badge">37</span>
</a>

            <a  href="https://anime3rb.com/genre/love-status-quo" class="btn btn-md btn-link genre">
    حالة حب
            <span class="badge">37</span>
</a>

            <a  href="https://anime3rb.com/genre/idols-male" class="btn btn-md btn-link genre">
    أيدول ذكور
            <span class="badge">33</span>
</a>

            <a  href="https://anime3rb.com/genre/pets" class="btn btn-md btn-link genre">
    حيوانات أليفة
            <span class="badge">32</span>
</a>

            <a  href="https://anime3rb.com/genre/medical" class="btn btn-md btn-link genre">
    طبي
            <span class="badge">29</span>
</a>

            <a  href="https://anime3rb.com/genre/boys-love" class="btn btn-md btn-link genre">
    حب فتيان
            <span class="badge">25</span>
</a>

            <a  href="https://anime3rb.com/genre/crossdressing" class="btn btn-md btn-link genre">
    تنكر في ملابس الجنس الآخر
            <span class="badge">24</span>
</a>

            <a  href="https://anime3rb.com/genre/magical-sex-shift" class="btn btn-md btn-link genre">
    تبديل جنسي سحري
            <span class="badge">21</span>
</a>

            <a  href="https://anime3rb.com/genre/showbiz" class="btn btn-md btn-link genre">
    صناعة الترفيه
            <span class="badge">20</span>
</a>

            <a  href="https://anime3rb.com/genre/erotica" class="btn btn-md btn-link genre">
    ايروتيكا
            <span class="badge">14</span>
</a>

            <a  href="https://anime3rb.com/genre/educational" class="btn btn-md btn-link genre">
    تعليمية
            <span class="badge">10</span>
</a>

            <a  href="https://anime3rb.com/genre/villainess" class="btn btn-md btn-link genre">
    شريرة
            <span class="badge">8</span>
</a>

    </div>
    </div>
</aside>        
        <div class="flex justify-between flex-col flex-grow overflow-hidden">
            <main class="flex-grow bg-gray-100 dark:bg-dark-800 flex flex-col">
                
                                
                
                                
                <div wire:snapshot="{&quot;data&quot;:{&quot;title_slug&quot;:&quot;clannad&quot;,&quot;video_number&quot;:&quot;1&quot;,&quot;views&quot;:8190},&quot;memo&quot;:{&quot;id&quot;:&quot;FZzlzC0rUtOUu5tk5TM5&quot;,&quot;name&quot;:&quot;video.show-video&quot;,&quot;path&quot;:&quot;episode\/clannad\/1&quot;,&quot;method&quot;:&quot;GET&quot;,&quot;children&quot;:[],&quot;scripts&quot;:[],&quot;assets&quot;:[],&quot;errors&quot;:[],&quot;locale&quot;:&quot;ar&quot;},&quot;checksum&quot;:&quot;a82351439929a8b618c52a438a6ac4cf271a55f0a62b6e3bd69f5ec344814032&quot;}" wire:effects="[]" wire:id="FZzlzC0rUtOUu5tk5TM5">
    
     
    
     
     
     
    
    <section id="player-section" class="bg-white dark:bg-dark-700/30 pb-4 xl:px-6 xl:py-8 lg:p-4" :class="{'xl:px-6 xl:py-8 lg:p-4': ! cinemaMode}" data-title="clannad" data-video="1" x-data="{
        cinemaMode: null,
        videoUrl: 'https:\/\/videos.vid3rb.com\/player\/9a01a7f5-a377-4925-b559-3e051543ce45?token=146f9cc339135cd950a559b1459e22c42617ed93a17a4262e69f550e11747f4b\u0026expires=1745813979',
        views: window.Livewire.find('FZzlzC0rUtOUu5tk5TM5').entangle('views'),
        toggleCinemaMode() {
            this.cinemaMode = ! this.cinemaMode
            Cookies.set('cinemaMode', this.cinemaMode);
        },
        get currentVideoUrl() {
            watchingList = JSON.parse(Cookies.get('watching-list') || '{}');
            videoWatchingHistory = watchingList['clannad'];
            currentTime = videoWatchingHistory && videoWatchingHistory.video == 1 ? videoWatchingHistory.time : 0;

            var url = new URL(this.videoUrl);
            url.searchParams.append('cinema', 760)
            
            if(next = document.querySelector('.videos-list a.active').nextElementSibling) {
                url.searchParams.append('last', 0)
                image = next.querySelector('img').dataset.src;
                title = next.querySelector('div > span').innerText;
                sub_title = next.querySelector('div > p').innerText;
                url.searchParams.append('next-image', image)
                url.searchParams.append('next-title', title)
                url.searchParams.append('next-sub-title', sub_title)
            }
            
            if(currentTime) {
                url.searchParams.append('start', currentTime)
            }

            return url.href;
        },
    }"
    
    @cinemamode.window="toggleCinemaMode">
        <div class="mx-auto xl:container" :class="{'xl:container': ! cinemaMode}">
            <div class="flex flex-wrap w-full justify-center gap-2 md:gap-4 lg:gap-6">
                <div class="flex-grow flex flex-col gap-4 w-[780px] min-[1750px]:w-[1000px]" :class="{'w-full': cinemaMode, 'w-[780px] min-[1750px]:w-[1000px]': !cinemaMode}">
                    <div class="bg-gray-100 dark:bg-dark-700 relative aspect-video" :class="{'h-[56vw] max-h-[calc(100vh-160px)]': cinemaMode, 'aspect-video': ! cinemaMode}" wire:ignore>
                        <iframe title="Clannad الحلقة 1" class="w-full h-full" :src="currentVideoUrl" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
                    </div>

                    <div class="container px-2 3xl:px-0 mx-auto flex-grow flex flex-col gap-6">
                        <div class="flex flex-wrap md:flex-nowrap justify-between gap-2">
                            <div class="flex-grow">
                                <h1 class="text-lg xl:font-semibold">
                                    <a  href="https://anime3rb.com/titles/clannad" class="btn btn-md btn-plain">
    Clannad
                                        الحلقة 1
                                                                                    بترجمة NenobaSubs
</a>

                                </h1>
    
                                                                    <h2 class="text-lg font-light">على مسار التلال حيث ترفرف أزهار الكرز</h2>
                                                            </div>

                            <div class="flex flex-shrink-0 items-center font-light gap-2" x-cloak x-show="views">
                                <span x-text="views">8190</span> 
                                <span>مشاهدة</span>
                            </div>
                        </div>

                        <div class="flex justify-center xl:rounded-lg flex-grow flex-wrap hidden">
                            <div class="flex-grow relative overflow-auto h-[4.5rem]">
                                <div class="flex gap-2 absolute w-full h-full pb-2">
                                    <button type="button" class="btn btn-md btn-light flex-shrink-0 flex flex-col items-center justify-center gap-1.5 dark:!bg-dark-600/30 px-6" data-video-source="https://videos.vid3rb.com/player/9a01a7f5-a377-4925-b559-3e051543ce45?token=146f9cc339135cd950a559b1459e22c42617ed93a17a4262e69f550e11747f4b&amp;expires=1745813979" x-bind:class="videoUrl == $el.dataset.videoSource ? 'active bg-gray-300 dark:!bg-dark-600/80' : ''" @click="videoUrl = $el.dataset.videoSource" wire:key="64edff69dc1d2">
    <span class="text-[0.9rem]">ترجمة NenobaSubs</span>
</button>

                                    </div>
                            </div>
                        </div>

                        <div class="flex flex-wrap justify-between gap-4">
                            <div class="w-fit !p-0 flex-shrink rounded-none flex flex-grow items-center gap-3">
                                <img src="https://anime3rb.com/storage/143641/conversions/figure-square-thumb.png" loading="lazy" class="w-12 aspect-square object-cover object-center rounded-full" alt="الصورة الشخصية ل Anime3rb" />    
                                <div>
                                    <span>Anime3rb</span>
                                    <p class="font-light text-sm">الثلاثاء 2:23 م - 29 أغسطس 2023</p>
                                </div>
                            </div>
                            
                            <div class="flex-grow md:flex-grow-0 flex flex-wrap gap-2">
                                <a  href="https://anime3rb.com/titles/clannad" class="btn btn-md btn-white flex-grow flex-shrink-0 flex items-center justify-center gap-3 border dark:border-dark-700">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5" fill="none" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
</svg>
                                      <span>العودة لصفحة العمل</span>
</a>

                            </div>
                        </div>

                        <div class="flex flex-col rounded-lg bg-gray-100/70 dark:bg-dark-700/30">
                            <div class="flex gap-3 py-4 items-center justify-center">
                                <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5" fill="none" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
</svg>
                                      <h2>تحميل مباشر</h3>
                            </div>

                            <div class="divide-y">
                                <div class="flex flex-col items-center gap-3 text-center bg-gray-200/50 dark:bg-dark-700/50 p-4 border-gray-100 dark:border-dark-600/50" wire:key="download.64edff69dc1d2">
                    <h3 class="text-start px-3">
                <small class="text-sm mb-1 font-light">
                    ترجمة NenobaSubs
                </small>
            </h3>
                
        <div class="flex-grow flex flex-wrap gap-4 justify-center">
                            
                                    <div class="flex-grow sm:max-w-[400px] flex rounded-lg bg-gray-50 dark:!bg-dark-600/30 border border-gray-50 dark:border-dark-600 relative">
                                                    <svg fill="currentColor" viewBox="0 0 267.5 267.5" stroke="currentColor" class="h-6 w-6 inline z-[5] absolute -top-3.5 -right-2 !w-6 !h-6 scale-x-[125%] rotate-[30deg]" fill="none" stroke-width="1.5">
    <path d="M256.975,100.34c0.041,0.736-0.013,1.485-0.198,2.229l-16.5,66c-0.832,3.325-3.812,5.663-7.238,5.681l-99,0.5
	c-0.013,0-0.025,0-0.038,0H35c-3.444,0-6.445-2.346-7.277-5.688l-16.5-66.25c-0.19-0.764-0.245-1.534-0.197-2.289
	C4.643,98.512,0,92.539,0,85.5c0-8.685,7.065-15.75,15.75-15.75S31.5,76.815,31.5,85.5c0,4.891-2.241,9.267-5.75,12.158
	l20.658,20.814c5.221,5.261,12.466,8.277,19.878,8.277c8.764,0,17.12-4.162,22.382-11.135l33.95-44.984
	C119.766,67.78,118,63.842,118,59.5c0-8.685,7.065-15.75,15.75-15.75s15.75,7.065,15.75,15.75c0,4.212-1.672,8.035-4.375,10.864
	c0.009,0.012,0.02,0.022,0.029,0.035l33.704,45.108c5.26,7.04,13.646,11.243,22.435,11.243c7.48,0,14.514-2.913,19.803-8.203
	l20.788-20.788C238.301,94.869,236,90.451,236,85.5c0-8.685,7.065-15.75,15.75-15.75s15.75,7.065,15.75,15.75
	C267.5,92.351,263.095,98.178,256.975,100.34z M238.667,198.25c0-4.142-3.358-7.5-7.5-7.5h-194c-4.142,0-7.5,3.358-7.5,7.5v18
	c0,4.142,3.358,7.5,7.5,7.5h194c4.142,0,7.5-3.358,7.5-7.5V198.25z"/>
</svg>                        
                        <div class="flex-grow flex flex-col rounded-r-lg overflow-hidden bg-gray-50 dark:bg-dark-700">
                            <label class="px-6 py-2 font-light flex-grow">جودة عالية بحجم أقل [1080p HEVC]</label>

    <a  href="https://anime3rb.com/download/9e48089d-959e-447f-8512-2702d2241dd0?expires=1745803179&amp;signature=00684b369482f196b36b9efb98efe64f26e3468570d463d54766052f27ba3ddb" class="btn btn-md btn-white !rounded-none !px-8 !py-4 dark:!bg-dark-600/30" wire:key="67bb3591c398e" target="_blank" rel="noreferrer noopener nofollow">
    تحميل مباشر [199.65 ميغابايت]
</a>

                        </div>

                        <a  href="https://anime3rb.com/hevc" class="btn btn-md btn-white flex flex-col gap-1.5 items-center justify-center !px-4 !py-1 border-r border-gray-50 dark:border-dark-600/60 !rounded-r-none">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-7 !h-7 scale-x-[-1]" fill="none" stroke-width="0.7">
    <path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
</svg>                              <span class="font-light text-xs">اعرف المزيد</span>
</a>

                    </div>
                                            
                                    <div class="flex flex-col flex-grow sm:max-w-[300px] rounded-lg overflow-hidden bg-gray-50 dark:bg-dark-700">
                        <label class="px-6 py-2 font-light flex-grow">جودة عالية [1080p]</label>

    <a  href="https://anime3rb.com/download/9a01a7f6-8ac8-4fd8-99bf-480daab7f4dc?expires=1745803179&amp;signature=0dac786f0ce4c3e297a0677195bc3d8b729aa00efc0b4368ec0cd2c4d781bcff" class="btn btn-md btn-white !rounded-none !px-8 !py-4 dark:!bg-dark-600/30" wire:key="64edff7c0fb0b" target="_blank" rel="noreferrer noopener nofollow">
    تحميل مباشر [258.83 ميغابايت]
</a>

                    </div>
                                            
                                    <div class="flex flex-col flex-grow sm:max-w-[300px] rounded-lg overflow-hidden bg-gray-50 dark:bg-dark-700">
                        <label class="px-6 py-2 font-light flex-grow">جودة متوسطة [720p]</label>

    <a  href="https://anime3rb.com/download/9a01a7f6-8799-4e34-ac9b-6941d94a48e6?expires=1745803179&amp;signature=5ee145069130f1b1591fe92e13e0d246402a0b3a3759c02f8e59d288f402c1f6" class="btn btn-md btn-white !rounded-none !px-8 !py-4 dark:!bg-dark-600/30" wire:key="64edff7c0db63" target="_blank" rel="noreferrer noopener nofollow">
    تحميل مباشر [123.26 ميغابايت]
</a>

                    </div>
                                            
                                    <div class="flex flex-col flex-grow sm:max-w-[300px] rounded-lg overflow-hidden bg-gray-50 dark:bg-dark-700">
                        <label class="px-6 py-2 font-light flex-grow">جودة منخفضة [480p]</label>

    <a  href="https://anime3rb.com/download/9a01a7f6-7f38-49b7-9f7e-0f1d69e0024c?expires=1745803179&amp;signature=3d61cc16888b0599abdecc275fe5fba3f5f8313bdfac32fe62908a09d35d87ed" class="btn btn-md btn-white !rounded-none !px-8 !py-4 dark:!bg-dark-600/30" wire:key="64edff7c05a72" target="_blank" rel="noreferrer noopener nofollow">
    تحميل مباشر [54.14 ميغابايت]
</a>

                    </div>
                                    </div>
    </div>

    <div class="flex flex-col items-center gap-3 bg-gray-200/50 dark:bg-dark-700/50 p-1 border-gray-100 dark:border-dark-600/30">
        <div class="flex items-center justify-center gap-4 flex-grow w-full mx-auto rounded-lg bg-primary-100/80 dark:bg-primary-600/50 p-4">
            <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline flex-shrink-0 !w-10 !h-10 text-primary-600 dark:text-primary-300" fill="none" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
</svg>
            <div class="flex flex-wrap md:flex-nowrap items-center gap-4 flex-grow">
                <p>هل سرعة التحميل غير مرضية بالنسبة لك؟ العضوية المميزة تمنحك سرعة تصل إلى 10 ميغابايت في الثانية.</p>
                
                <a  href="https://anime3rb.com/premium" class="btn btn-md btn-primary !px-10 !py-2.5 text-center flex-shrink-0 sm:max-w-xs">
    اشترك الأن
</a>

            </div>
        </div>
    </div>

                            </div>
                        </div>
                    </div>
                </div>

                <div class="container lg:px-0 flex-grow w-80 min-h-[500px] max-h-[calc(100vh-135px)] rounded-lg bg-gray-100 dark:bg-dark-700 border border-gray-200 dark:border-dark-600/50 overflow-hidden" x-data="{
    searchQuery: '',
    sortDesc: false,
}">
    <div class="sticky top-0 border-b dark:border-dark-600/50 w-full bg-gray-100 dark:bg-dark-700 flex items-center z-[1]">
        <!-- Search Form -->
<div class="relative flex-grow w-full">
    <div class="flex gap-2">
        <div class="flex flex-grow relative">
            <input id="search" type="search" name="search" placeholder="بحث..." class="flex-grow p-3 bg-gray-100 dark:bg-dark-700 border-gray-100 dark:border-dark-700 focus:bg-gray-200/70 dark:focus:brightness-95 focus:border-transparent focus:ring-0 w-full rounded-lg pl-12 rtl:pl-3 rtl:pr-12 !rounded-none" x-model="searchQuery" autocomplete="off">

            <button class="absolute top-2.5 left-2 rtl:left-auto rtl:right-2 outline-none cursor-pointer text-primary-500 hover:text-primary-700 focus:text-primary-700 dark:text-dark-400 py-1 px-2">
                <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5" fill="none" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
</svg>
                  <span class="sr-only">بحث</span>
            </button>
        </div>
    </div>
</div>
<!-- End Seach Form -->
        <div class="px-2 py-0.5">
            <button type="submit" class="btn btn-md btn-light flex items-center justify-center  w-10 h-10 !p-0" @click="sortDesc = !sortDesc">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5" fill="none" stroke-width="1.5" x-cloak="x-cloak" x-show="! sortDesc">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
</svg>
                      <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5" fill="none" stroke-width="1.5" x-cloak="x-cloak" x-show="sortDesc">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12" />
</svg>
                      <span class="sr-only" x-text="sortDesc ? 'ترتيب تنازلي' : 'ترتيب تصاعدي'">ترتيب تصاعدي</span>
</button>
        </div>
    </div>
    
    <div class="videos-list relative overflow-auto w-full h-[calc(100%-100px)]" x-ref="videosContainer">
        <div class="absolute w-full h-auto min-h-full flex flex-col overflow-hidden">
            <div class="flex flex-grow flex-col" :class="sortDesc ? 'flex-col-reverse' : ''">
                                    <a  href="https://anime3rb.com/episode/clannad/1" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3 active brightness-[97%] dark:brightness-[93%]" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 1</span>
                            <p class="font-light text-sm">على مسار التلال حيث ترفرف أزهار الكرز</p>
                        </div>

                                                    <div class="flex-grow flex justify-end" x-init="$refs.videosContainer.scrollTop = $el.parentNode.previousElementSibling?.offsetTop">
                                <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-7 !h-7 stroke-none fill-dark-200/70 dark:fill-dark-500 opacity-80" fill="none" stroke-width=".8">
    <path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
</svg>
                                  </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/2" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 2</span>
                            <p class="font-light text-sm">الخطوة الأولى</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/3" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 3</span>
                            <p class="font-light text-sm">مرة أخرى بعد البكاء</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/4" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 4</span>
                            <p class="font-light text-sm">لنبحث عن أصدقاء</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/5" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 5</span>
                            <p class="font-light text-sm">المشهد بالنحت</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/6" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 6</span>
                            <p class="font-light text-sm">مهرجان مؤسس الأخت الأكبر والأصغر</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/7" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 7</span>
                            <p class="font-light text-sm">مشاعر على شكل نجمة</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/8" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 8</span>
                            <p class="font-light text-sm">الرياح التي تختفي في الشفق</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/9" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 9</span>
                            <p class="font-light text-sm">حتى نهاية الحلم</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/10" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 10</span>
                            <p class="font-light text-sm">تحدي الفتاة العبقرية</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/11" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 11</span>
                            <p class="font-light text-sm">رابسودي بعد المدرسة</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/12" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 12</span>
                            <p class="font-light text-sm">عالم مخفي</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/13" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 13</span>
                            <p class="font-light text-sm">حديقة الذكريات</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/14" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 14</span>
                            <p class="font-light text-sm">نظرية كل شيء</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/15" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 15</span>
                            <p class="font-light text-sm">مشكلة عالقة</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/16" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 16</span>
                            <p class="font-light text-sm">3 على 3</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/17" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 17</span>
                            <p class="font-light text-sm">غرفة بدون أي شخص</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/18" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 18</span>
                            <p class="font-light text-sm">تدابير مضادة</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/19" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 19</span>
                            <p class="font-light text-sm">حياة جديدة</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/20" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 20</span>
                            <p class="font-light text-sm">الماضي المخفي</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/21" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 21</span>
                            <p class="font-light text-sm">مهرجان «الوجه نحو المدرسة»</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/22" class="btn btn-md btn-light border-b w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">24:16</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 22</span>
                            <p class="font-light text-sm">اثنين من الظلال</p>
                        </div>
</a>

                                    <a  href="https://anime3rb.com/episode/clannad/23" class="btn btn-md btn-light  w-full px-2 py-1 !rounded-none dark:border-dark-600/50 flex items-center gap-3" x-show="!searchQuery || $el.querySelector('.video-data').innerText.includes(searchQuery)">
    <div class="relative flex-shrink-0">
                            <img src="https://anime3rb.com/storage/2211/164edfe415cbe4.jpg" loading="lazy" class="w-24 aspect-video object-cover object-center rounded" wire:ignore="" alt="بوستر Clannad" />                            <span class="rounded absolute bottom-1 right-1 text-white text-xs px-1 py-0.5 bg-dark-900/80">23:31</span>
                        </div>

                        <div class="video-data">
                            <span>الحلقة 23 الأخيرة</span>
                            <p class="font-light text-sm">أحداث العطلات الصيفية</p>
                        </div>
</a>

                            </div>
        </div>
    </div>
    
            <div class="sticky -bottom-[1px]">
            <a  href="https://anime3rb.com/titles/clannad/download" class="btn btn-md btn-primary flex items-center gap-3 !p-4 justify-center !rounded-t-none">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5" fill="none" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
</svg>
                      <span>تحميل كل الحلقات برابط واحد</span>
</a>

        </div>
    </div>            </div>
        </div>
    </section>

    

    </div>
            </main>

            <!-- Page Footer -->
            <footer class="bg-white dark:bg-dark-800">
                <div class="container mx-auto text-center px-4 py-8 md:py-4 flex flex-col sm:flex-row flex-wrap justify-center sm:justify-between items-center gap-4">
                    <p>جميع الحقوق محفوظة © أنمي عرب 2025</p>
    
                    <div class="flex flex-wrap gap-3 justify-center items-center" dir="ltr">
    <a  href="https://facebook.com/anime3rb" class="btn btn-md btn-light !p-0 !w-12 !h-12 flex items-center justify-center !rounded-full" target="_blank" rel="noreferrer noopener nofollow" title="فيس بوك">
    <svg viewBox="0 0 512 512" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5 text-[#1877f2] dark:text-white" fill="none" stroke-width="1.5">
    <path d="M374.245,285.825l14.104,-91.961l-88.233,0l0,-59.677c0,-25.159 12.325,-49.682 51.845,-49.682l40.117,0l0,-78.291c0,0 -36.408,-6.214 -71.214,-6.214c-72.67,0 -120.165,44.042 -120.165,123.775l0,70.089l-80.777,0l0,91.961l80.777,0l0,222.31c16.197,2.542 32.798,3.865 49.709,3.865c16.911,0 33.512,-1.323 49.708,-3.865l0,-222.31l74.129,0Z" style="fill:currentColor;fill-rule:nonzero;"/>
</svg>
        <span class="sr-only">فيس بوك</span>
</a>

    <a  href="https://twitter.com/anime3rbcom" class="btn btn-md btn-light !p-0 !w-12 !h-12 flex items-center justify-center !rounded-full" target="_blank" rel="noreferrer noopener nofollow" title="إكس (تويتر سابقا)">
    <svg version="1.1" viewBox="0 0 256 256" stroke="currentColor" class="h-6 w-6 inline !w-5 !h-5 dark:text-white" fill="none" stroke-width="1.5">
    <g style="stroke: none; stroke-width: 0; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: none; fill-rule: nonzero; opacity: 1;" transform="translate(1.4065934065934016 1.4065934065934016) scale(2.81 2.81)" >
        <path d="M 0.219 2.882 l 34.748 46.461 L 0 87.118 h 7.87 l 30.614 -33.073 l 24.735 33.073 H 90 L 53.297 38.043 L 85.844 2.882 h -7.87 L 49.781 33.341 L 27.001 2.882 H 0.219 z M 11.793 8.679 h 12.303 L 78.425 81.32 H 66.122 L 11.793 8.679 z" style="stroke: none; stroke-width: 1; stroke-dasharray: none; stroke-linecap: butt; stroke-linejoin: miter; stroke-miterlimit: 10; fill: currentColor; fill-rule: nonzero; opacity: 1;" transform=" matrix(1 0 0 1 0 0) " stroke-linecap="round" />
    </g>
</svg>
        <span class="sr-only">إكس (تويتر سابقا)</span>
</a>

    <a  href="https://patreon.com/anime3rb/membership" class="btn btn-md btn-light !p-0 !w-12 !h-12 flex items-center justify-center !rounded-full" target="_blank" rel="noreferrer noopener nofollow" title="باتريون">
    <svg viewBox="0 0 245.53 268.91" stroke="currentColor" fill="currentColor" class="h-6 w-6 inline !w-5 !h-5 dark:text-white">
    <path d="M506.76,330.33c0-34.34-26.79-62.48-58.16-72.63-39-12.61-90.35-10.78-127.55,6.77-45.09,21.28-59.26,67.89-59.78,114.37-.43,38.22,3.38,138.88,60.16,139.6,42.19.54,48.47-53.83,68-80,13.89-18.63,31.77-23.89,53.78-29.34C481,399.74,506.82,369.88,506.76,330.33Z" transform="translate(-261.24 -249.55)"/>
</svg>
        <span class="sr-only">باتريون</span>
</a>

</div>
                </div>
            </footer>
        </div>
    </div>
    
    <div wire:snapshot="{&quot;data&quot;:[],&quot;memo&quot;:{&quot;id&quot;:&quot;OSlk9rjGvAkJpZhxidZt&quot;,&quot;name&quot;:&quot;offline-indicator&quot;,&quot;path&quot;:&quot;episode\/clannad\/1&quot;,&quot;method&quot;:&quot;GET&quot;,&quot;children&quot;:[],&quot;scripts&quot;:[],&quot;assets&quot;:[],&quot;errors&quot;:[],&quot;locale&quot;:&quot;ar&quot;},&quot;checksum&quot;:&quot;dd20c2e0e97c1fc04af06904f77dbfa7cb4228aba7786e272f0000cdfaea0742&quot;}" wire:effects="[]" wire:id="OSlk9rjGvAkJpZhxidZt" class="offline">
    <div x-data="{open: true}" :style="open ? {} : { display: 'none' }" class="flex fixed inset-x-0 bottom-0 z-30 justify-center">
        <div wire:offline class="w-max mx-auto inset bg-white dark:bg-dark-700 shadow-md my-4 mx-4 sm:mx-0 rounded-3xl py-3 ps-6 pe-3">
            <div class="flex gap-4 items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                </svg>

                <span>لقد فقدت إتصالك بالإنترنت.</span>

                <button type="submit" class="btn btn-md btn-light !p-2 !rounded-full dark:!bg-dark-800/20" @click="open = false">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline" fill="none" stroke-width="1.5">
    <path d="M6 18L18 6M6 6l12 12" />
</svg>                    <span class="sr-only">إغلاق</span>
</button>
            </div>
        </div>
    </div>
</div>

    <div 
    x-data="{ 
        isOpen: false,
        countdownInit: 0,
        countdown: 0,
        modalData: {},
        open: function(){
            this.countdown = this.countdownInit;
            this.isOpen = true;
            this.startCountdown()
        },
        close: function(){
            if(this.isOpen && ! this.countdown){
                this.isOpen = false;
            }
        },
        toggle: function(){
            this.isOpen ? this.close() : this.open();
        },
        startCountdown: function(){
            countdownInterval = setInterval(() => { 
                this.countdown = this.countdown > 0 ? this.countdown - 1 : this.countdown

                if(! this.countdown) {
                    clearInterval(countdownInterval)
                }
            }, 1000)
        }
    }" 
    @keyup.escape.window="close"
    @open-modal.window="
        if($event.detail === $refs.modalDialog.getAttribute('id') || $event.detail.modal == $refs.modalDialog.getAttribute('id')){
            modalData = $event.detail; 
            open();
        }
    "
>
    <div @click="toggle"></div>

    <div 
        x-show="isOpen" 
        x-cloak
        x-id="['modal']"
        x-transition.opacity
        x-trap.inert.noscroll="isOpen"
        class="fixed h-full top-0 right-0 left-0 bg-black/60 overflow-auto z-50"
        @click="close"
        @open-modal.window="setTimeout(function(){ $focus.wrap().next() }, 300)"
    >
        <div class="w-full h-auto min-h-full flex justify-center items-center sm:py-5">
            <div 
                x-show="isOpen"
                x-transition
                @click.stop
                tabindex="-1" 
                role="dialog"
                x-ref="modalDialog"
                :aria-labelledby="$id('modal')"
                class="bg-white dark:bg-dark-750 w-full mx-0 rounded-[1.4rem] sm:mx-4 flex flex-col overflow-hidden shadow-lg shadow-black/30 outline-0 mx-1 sm:max-w-lg" id="modal"
            >

                <div class="relative flex flex-row-reverse w-full dark:bg-dark-750 bg-gray-100 justify-between items-center">
                    <div>
                        <p class="text-xl font-semibold py-5 px-7" x-show="countdown" x-ref="countdown" x-text="countdown"></p>

                        <button type="submit" class="btn btn-md btn-plain text-gray-500 text-2xl p-5" @click="close" x-show="! countdown" x-ref="close" aria-label="Close" aria-hidden="true">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline" fill="none" stroke-width="1.5">
    <path d="M6 18L18 6M6 6l12 12" />
</svg>                            <span class="sr-only">إغلاق</span>
</button>
                    </div>
                    
                    <p :id="$id('modal')" class="p-5" x-html="modalData.header"></p>
                </div>
                
                <div class="flex flex-grow flex-col w-full items-center dark:bg-dark-700">
                    <div class="flex flex-grow flex-col w-full" x-html="modalData.body"></div>
                </div>
                
                            </div>
        </div>
    </div>
</div >
    <div 
    x-data="{ 
        isOpen: false,
        countdownInit: 0,
        countdown: 0,
        modalData: {},
        open: function(){
            this.countdown = this.countdownInit;
            this.isOpen = true;
            this.startCountdown()
        },
        close: function(){
            if(this.isOpen && ! this.countdown){
                this.isOpen = false;
            }
        },
        toggle: function(){
            this.isOpen ? this.close() : this.open();
        },
        startCountdown: function(){
            countdownInterval = setInterval(() => { 
                this.countdown = this.countdown > 0 ? this.countdown - 1 : this.countdown

                if(! this.countdown) {
                    clearInterval(countdownInterval)
                }
            }, 1000)
        }
    }" 
    @keyup.escape.window="close"
    @open-modal.window="
        if($event.detail === $refs.modalDialog.getAttribute('id') || $event.detail.modal == $refs.modalDialog.getAttribute('id')){
            modalData = $event.detail; 
            open();
        }
    "
>
    <div @click="toggle"></div>

    <div 
        x-show="isOpen" 
        x-cloak
        x-id="['modal']"
        x-transition.opacity
        x-trap.inert.noscroll="isOpen"
        class="fixed h-full top-0 right-0 left-0 bg-black/60 overflow-auto z-50"
        @click="close"
        @open-modal.window="setTimeout(function(){ $focus.wrap().next() }, 300)"
    >
        <div class="w-full h-auto min-h-full flex justify-center items-center sm:py-5">
            <div 
                x-show="isOpen"
                x-transition
                @click.stop
                tabindex="-1" 
                role="dialog"
                x-ref="modalDialog"
                :aria-labelledby="$id('modal')"
                class="bg-white dark:bg-dark-750 w-full mx-0 rounded-[1.4rem] sm:mx-4 flex flex-col overflow-hidden shadow-lg shadow-black/30 outline-0 mx-1 sm:max-w-lg" id="premium-modal"
            >

                <div class="relative flex flex-row-reverse w-full dark:bg-dark-750 bg-gray-100 justify-between items-center">
                    <div>
                        <p class="text-xl font-semibold py-5 px-7" x-show="countdown" x-ref="countdown" x-text="countdown"></p>

                        <button type="submit" class="btn btn-md btn-plain text-gray-500 text-2xl p-5" @click="close" x-show="! countdown" x-ref="close" aria-label="Close" aria-hidden="true">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline" fill="none" stroke-width="1.5">
    <path d="M6 18L18 6M6 6l12 12" />
</svg>                            <span class="sr-only">إغلاق</span>
</button>
                    </div>
                    
                    <p :id="$id('modal')" class="p-5" >ميزة الاشتراك</p>
                </div>
                
                <div class="flex flex-grow flex-col w-full items-center dark:bg-dark-700">
                    <div class="flex flex-grow flex-col w-full" ><div class="flex flex-col gap-8 text-center items-center justify-center px-8 py-10">
            <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline !w-16 !h-16 text-red-500" fill="none" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
</svg>
              
            <p>عذرا!</p>

            <p>يجب أن تكون مشتركًا في العضوية المميزة للمتابعة.</p>

            <a  href="https://anime3rb.com/premium" class="btn btn-md btn-primary w-full py-4 flex-grow text-center">
    إشتراك
</a>

        </div></div>
                </div>
                
                            </div>
        </div>
    </div>
</div >
    <div 
    x-data="{ 
        isOpen: false,
        countdownInit: 0,
        countdown: 0,
        modalData: {},
        open: function(){
            this.countdown = this.countdownInit;
            this.isOpen = true;
            this.startCountdown()
        },
        close: function(){
            if(this.isOpen && ! this.countdown){
                this.isOpen = false;
            }
        },
        toggle: function(){
            this.isOpen ? this.close() : this.open();
        },
        startCountdown: function(){
            countdownInterval = setInterval(() => { 
                this.countdown = this.countdown > 0 ? this.countdown - 1 : this.countdown

                if(! this.countdown) {
                    clearInterval(countdownInterval)
                }
            }, 1000)
        }
    }" 
    @keyup.escape.window="close"
    @open-modal.window="
        if($event.detail === $refs.modalDialog.getAttribute('id') || $event.detail.modal == $refs.modalDialog.getAttribute('id')){
            modalData = $event.detail; 
            open();
        }
    "
>
    <div @click="toggle"></div>

    <div 
        x-show="isOpen" 
        x-cloak
        x-id="['modal']"
        x-transition.opacity
        x-trap.inert.noscroll="isOpen"
        class="fixed h-full top-0 right-0 left-0 bg-black/60 overflow-auto z-50"
        @click="close"
        @open-modal.window="setTimeout(function(){ $focus.wrap().next() }, 300)"
    >
        <div class="w-full h-auto min-h-full flex justify-center items-center sm:py-5">
            <div 
                x-show="isOpen"
                x-transition
                @click.stop
                tabindex="-1" 
                role="dialog"
                x-ref="modalDialog"
                :aria-labelledby="$id('modal')"
                class="bg-white dark:bg-dark-750 w-full mx-0 rounded-[1.4rem] sm:mx-4 flex flex-col overflow-hidden shadow-lg shadow-black/30 outline-0 mx-1 sm:max-w-lg" id="login-modal"
            >

                <div class="relative flex flex-row-reverse w-full dark:bg-dark-750 bg-gray-100 justify-between items-center">
                    <div>
                        <p class="text-xl font-semibold py-5 px-7" x-show="countdown" x-ref="countdown" x-text="countdown"></p>

                        <button type="submit" class="btn btn-md btn-plain text-gray-500 text-2xl p-5" @click="close" x-show="! countdown" x-ref="close" aria-label="Close" aria-hidden="true">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline" fill="none" stroke-width="1.5">
    <path d="M6 18L18 6M6 6l12 12" />
</svg>                            <span class="sr-only">إغلاق</span>
</button>
                    </div>
                    
                    <p :id="$id('modal')" class="p-5" >قم بتسجيل الدخول</p>
                </div>
                
                <div class="flex flex-grow flex-col w-full items-center dark:bg-dark-700">
                    <div class="flex flex-grow flex-col w-full" ><div class="flex flex-col gap-8 text-center items-center justify-center px-8 py-10">
            <p>يجب عليك تسجيل الدخول إلى حسابك للمتابعة.</p>

            <div class="w-full flex flex-wrap gap-2">
                <a  href="https://anime3rb.com/login" class="btn btn-md btn-light py-4 flex-grow text-center">
    تسجيل الدخول
</a>

                <a  href="https://anime3rb.com/register" class="btn btn-md btn-primary py-4 flex-grow text-center">
    حساب جديد
</a>

            </div>
        </div></div>
                </div>
                
                            </div>
        </div>
    </div>
</div >
    
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-LWE3WN8EV0"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());

        gtag('config', 'G-LWE3WN8EV0');
    </script>

            <div 
    x-data="{ 
        isOpen: false,
        countdownInit: 5,
        countdown: 5,
        modalData: {},
        open: function(){
            this.countdown = this.countdownInit;
            this.isOpen = true;
            this.startCountdown()
        },
        close: function(){
            if(this.isOpen && ! this.countdown){
                this.isOpen = false;
            }
        },
        toggle: function(){
            this.isOpen ? this.close() : this.open();
        },
        startCountdown: function(){
            countdownInterval = setInterval(() => { 
                this.countdown = this.countdown > 0 ? this.countdown - 1 : this.countdown

                if(! this.countdown) {
                    clearInterval(countdownInterval)
                }
            }, 1000)
        }
    }" 
    @keyup.escape.window="close"
    @open-modal.window="
        if($event.detail === $refs.modalDialog.getAttribute('id') || $event.detail.modal == $refs.modalDialog.getAttribute('id')){
            modalData = $event.detail; 
            open();
        }
    "
>
    <div @click="toggle"></div>

    <div 
        x-show="isOpen" 
        x-cloak
        x-id="['modal']"
        x-transition.opacity
        x-trap.inert.noscroll="isOpen"
        class="fixed h-full top-0 right-0 left-0 bg-black/60 overflow-auto z-50"
        @click="close"
        @open-modal.window="setTimeout(function(){ $focus.wrap().next() }, 300)"
    >
        <div class="w-full h-auto min-h-full flex justify-center items-center sm:py-5">
            <div 
                x-show="isOpen"
                x-transition
                @click.stop
                tabindex="-1" 
                role="dialog"
                x-ref="modalDialog"
                :aria-labelledby="$id('modal')"
                class="bg-white dark:bg-dark-750 w-full mx-0 rounded-[1.4rem] sm:mx-4 flex flex-col overflow-hidden shadow-lg shadow-black/30 outline-0 mx-1 sm:max-w-lg" id="support"
            >

                <div class="relative flex flex-row-reverse w-full dark:bg-dark-750 bg-gray-100 justify-between items-center">
                    <div>
                        <p class="text-xl font-semibold py-5 px-7" x-show="countdown" x-ref="countdown" x-text="countdown"></p>

                        <button type="submit" class="btn btn-md btn-plain text-gray-500 text-2xl p-5" @click="close" x-show="! countdown" x-ref="close" aria-label="Close" aria-hidden="true">
    <svg viewBox="0 0 24 24" stroke="currentColor" class="h-6 w-6 inline" fill="none" stroke-width="1.5">
    <path d="M6 18L18 6M6 6l12 12" />
</svg>                            <span class="sr-only">إغلاق</span>
</button>
                    </div>
                    
                    <p :id="$id('modal')" class="p-5" >يرجى تعطيل مانع الإعلانات</p>
                </div>
                
                <div class="flex flex-grow flex-col w-full items-center dark:bg-dark-700">
                    <div class="flex flex-grow flex-col w-full" ><a href="https://joohugreene.net/4/9023731" target="_blank" @click="$el.remove()" style="position: absolute;width: 100vw;height: 100vh;top: 0;left: 0;"></a>
    
    <div class="flex flex-col gap-8 text-center items-center justify-center px-8 py-10" wire:poll>
        <div wire:snapshot="{&quot;data&quot;:[],&quot;memo&quot;:{&quot;id&quot;:&quot;nOksluubFFjugoB3p5gz&quot;,&quot;name&quot;:&quot;support&quot;,&quot;path&quot;:&quot;episode\/clannad\/1&quot;,&quot;method&quot;:&quot;GET&quot;,&quot;children&quot;:[],&quot;scripts&quot;:[],&quot;assets&quot;:[],&quot;lazyLoaded&quot;:false,&quot;lazyIsolated&quot;:true,&quot;errors&quot;:[],&quot;locale&quot;:&quot;ar&quot;},&quot;checksum&quot;:&quot;ccfef4b1e5b97d23b502bd984437caedd64e543b4f9a947d766afa215bc43fe6&quot;}" wire:effects="[]" wire:id="nOksluubFFjugoB3p5gz" x-intersect="$wire.__lazyLoad(&#039;eyJkYXRhIjp7ImZvck1vdW50IjpbW10seyJzIjoiYXJyIn1dfSwibWVtbyI6eyJpZCI6Im8ybHBlQ1hUT2tRaHVRNHBzM2hTIiwibmFtZSI6Il9fbW91bnRQYXJhbXNDb250YWluZXIifSwiY2hlY2tzdW0iOiIzNGY4ODEyNDkxMjlhNDRkMWEwMzQxZDcyYzA1MDNiMWYzZTAwN2EwNTU2NDIyMTdiZDkwNWQ1MTc5MGRmYjMxIn0=&#039;)" class="bg-white dark:bg-dark-700/50 rounded-md text-center py-24">
                <svg class="inline w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-primary-600 dark:fill-gray-200 !w-10 !h-10" aria-hidden="true" viewBox="0 0 100 101" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z" fill="currentColor"></path>
    <path d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z" fill="currentFill"></path>
</svg>
            </div>
            </div></div>
                </div>
                
                            </div>
        </div>
    </div>
</div >
    
            <script type="application/ld+json">{"@context": "https://schema.org","@type": "Episode","name": "أنمي Clannad الحلقة 1 مترجمة أون لاين - Anime3rb أنمي عرب","url": "https://anime3rb.com/episode/clannad/1","datePublished": "2023-08-29T14:23:37+00:00","inLanguage": "ar","description": "مشاهدة و تحميل أنمي Clannad الحلقة 1 اون لاين بعنوان على مسار التلال حيث ترفرف أزهار الكرز - Anime3rb أنمي عرب","video": [{"@type": "VideoObject","name": "Clannad الحلقة 1 بترجمة NenobaSubs - Anime3rb أنمي عرب","thumbnailUrl": "https://videos.vid3rb.com/cdn/9a01a7f6-8430-44ef-9b3a-f3a4f30ed3ff","embedUrl": "https://videos.vid3rb.com/player/9a01a7f5-a377-4925-b559-3e051543ce45?token=146f9cc339135cd950a559b1459e22c42617ed93a17a4262e69f550e11747f4b&amp;expires=1745813979","playerType": "HTML5","description": "Clannad الحلقة 1 بترجمة NenobaSubs بعنوان على مسار التلال حيث ترفرف أزهار الكرز - Anime3rb أنمي عرب","uploadDate": "2023-08-29T14:23:37+00:00","isFamilyFriendly": "true","duration": "PT24M16S","interactionStatistic": {"@type": "InteractionCounter","interactionType": {"@type": "http://schema.org/WatchAction"},"userInteractionCount": 117367}}],"isPartOf": {"@type": "TVSeries","name": "أنمي Clannad مترجم - Anime3rb أنمي عرب","url": "https://anime3rb.com/titles/clannad"}}</script>
        <script src="https://kulroakonsu.net/88/tag.min.js" data-zone="143573" async data-cfasync="false"></script>

            
        <script src="https://anime3rb.com/ad-bottom.js?v=a680ead7bacfca"></script>

        <script>
            document.addEventListener('alpine:init', () => {
                setTimeout(() => {
                    if ((typeof a680ead7bacfca == 'undefined') || ! window.hasOwnProperty('installOnFly')) {
                                                    if (Math.random() < 0.5) {
                                dispatchEvent(new CustomEvent('open-modal', { detail: 'support', 'bubbles': true }))
                            }
                                                
                        setInterval(() => {
                            dispatchEvent(new CustomEvent('open-modal', { detail: 'support', 'bubbles': true }))    
                        }, 180000);
                    }
                }, 3000);
            })
        </script>
    <script src="/livewire/livewire.min.js?id=df3a17f2"   data-csrf="moPRNMJSYUkQdppg76B4INpox19pqs01L8StPFIg" data-update-uri="/livewire/update" data-navigate-once="true"></script>
</body>
</html>
`);