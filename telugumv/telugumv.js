///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////       Main Functions          //////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

async function searchResults(keyword) {
    const searchUrl = `https://telugumv.fun/?s=${encodeURIComponent(keyword)}`;
    console.log(searchUrl);

    const response = await fetch(searchUrl);
    const html = await response;

    const results = [];
    const filmListRegex = /<div class="result-item">[\s\S]*?<\/article><\/div>/g;
    const items = html.match(filmListRegex) || [];

    items.forEach((itemHtml) => {
        const titleMatch = itemHtml.match(/<div class="title"><a href="([^"]+)">([^<]+)<\/a>/);
        const href = titleMatch ? titleMatch[1] : '';
        const title = titleMatch ? titleMatch[2] : '';
        const imgMatch = itemHtml.match(/<img[^>]*src="([^"]+)"[^>]*>/);
        const imageUrl = imgMatch ? imgMatch[1] : '';
        //Excluding TV shows, see line 70
        if (title && href && !href.includes('/tvshows/')) { 
            results.push({
                title: title.trim(),
                image: imageUrl.trim(),
                href: href.trim(),
            });
        }
    });

    console.log(results);
    return results;
}


async function extractDetails(url) {
    const response = await fetch(url);
    const html = await response;
    const details = [];

    const descriptionMatch = html.match(/<div itemprop="description" class="wp-content">[\s\S]*?<p>([\s\S]*?)<\/p>/);
    let description = descriptionMatch ? descriptionMatch[1].trim() : 'N/A';

    details.push({
        description: description,
        alias: 'N/A',
        airdate: 'N/A'
    });

    console.log(details);
    return details;
}

async function extractEpisodes(url) {
    const response = await fetch(url);
    const html = await response;
    const episodes = [];

    const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
    if (canonicalMatch) {
        const canonicalUrl = canonicalMatch[1];
        if (canonicalUrl.includes("/movies/")) {
            const jsonMatch = html.match(/<link rel="alternate" title="JSON" type="application\/json" href="https:\/\/telugumv\.fun\/wp-json\/wp\/v2\/movies\/(\d+)/);
            if (jsonMatch) {
                const id = jsonMatch[1];
                const episodeUrl = `https://telugumv.fun/wp-json/dooplayer/v2/${id}/movie/1`;

                episodes.push({
                    href: episodeUrl,
                    number: 1
                });
            } else {
                console.log("No JSON link found.");
            }
        } else {
            //This will never run do to me excluding TV shows from the search, their stream doesn't always work and neither does the download
            //I will keep the code in case it gets needed
            const seasonMatch = html.match(/<div class='se-c'>[\s\S]*?<\/div><\/div>/);
            if (seasonMatch) {
                const seasonHtml = seasonMatch[0];
                const episodeMatches = seasonHtml.match(/<div class='episodiotitle'><a href='([^']+)'>([^<]+)<\/a>/g);
                if (episodeMatches) {
                    episodeMatches.forEach((match, index) => {
                        const hrefMatch = match.match(/href='([^']+)/);
                        if (hrefMatch) {
                            episodes.push({
                                href: hrefMatch[1],
                                number: index + 1
                            });
                        }
                    });
                }
            }
        }
    } else {
        console.log("No canonical link found.");
    }
    console.log(episodes);
    return episodes;
}

async function searchResults(url) {
    const response = await fetch(url);
    const json = await JSON.parse(response);

    const embedUrl = json.embed_url;
    const embedResponse = await fetch(embedUrl);
    const data = await embedResponse; 

    const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);

    const unpackedScript = unpack(obfuscatedScript[1]);

    const m3u8Match = unpackedScript.match(/file:"(https?:\/\/.*?\.m3u8.*?)"/);

    const m3u8Url = m3u8Match[1];

    return m3u8Url;
}

////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////       Helper Functions       ////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////

/*
Credit to GitHub user @mnsrulz for Unpacker Node library

Credits to @jcpiccodev for writing the full deobfuscator <3
*/

class Unbaser {
    constructor(base) {
        this.ALPHABET = {
            62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            95: "' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
        };
        this.dictionary = {};
        this.base = base;
        if (36 < base && base < 62) {
            this.ALPHABET[base] = this.ALPHABET[base] ||
                this.ALPHABET[62].substr(0, base);
        }
        if (2 <= base && base <= 36) {
            this.unbase = (value) => parseInt(value, base);
        }
        else {
            try {
                [...this.ALPHABET[base]].forEach((cipher, index) => {
                    this.dictionary[cipher] = index;
                });
            }
            catch (er) {
                throw Error("Unsupported base encoding.");
            }
            this.unbase = this._dictunbaser;
        }
    }
    _dictunbaser(value) {
        let ret = 0;
        [...value].reverse().forEach((cipher, index) => {
            ret = ret + ((Math.pow(this.base, index)) * this.dictionary[cipher]);
        });
        return ret;
    }
}

function detect(source) {
    return source.replace(" ", "").startsWith("eval(function(p,a,c,k,e,");
}

function unpack(source) {
    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) {
        throw Error("Malformed p.a.c.k.e.r. symtab.");
    }
    let unbase;
    try {
        unbase = new Unbaser(radix);
    }
    catch (e) {
        throw Error("Unknown p.a.c.k.e.r. encoding.");
    }
    function lookup(match) {
        const word = match;
        let word2;
        if (radix == 1) {
            word2 = symtab[parseInt(word)];
        }
        else {
            word2 = symtab[unbase.unbase(word)];
        }
        return word2 || word;
    }
    source = payload.replace(/\b\w+\b/g, lookup);
    return _replacestrings(source);
    function _filterargs(source) {
        const juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
        ];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                let a = args;
                if (a[2] == "[]") {
                }
                try {
                    return {
                        payload: a[1],
                        symtab: a[4].split("|"),
                        radix: parseInt(a[2]),
                        count: parseInt(a[3]),
                    };
                }
                catch (ValueError) {
                    throw Error("Corrupted p.a.c.k.e.r. data.");
                }
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
    }
    function _replacestrings(source) {
        return source;
    }
}

