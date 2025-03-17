///////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////       Main Functions          //////////////////////////////
/////////////////////////////////////////////////////////////////////////////////////////

async function searchResults(keyword) {
    const searchUrl = `https://streamblasters.pm/?s=${encodeURIComponent(keyword)}`;
    try {
        const response = await fetch(searchUrl);
        const html = await response;
        const results = [];

        const articleRegex = /<article[^>]*class="post-item[\s\S]*?<\/article>/g;
        const items = html.match(articleRegex) || [];

        items.forEach((itemHtml) => {
            const titleMatch = itemHtml.match(/<h3[^>]*class="entry-title[\s\S]*?<a href="([^"]+)"[^>]*>([^<]+)<\/a>/);
            const imgMatch = itemHtml.match(/<img[^>]*src="([^"]+)"[^>]*>/);
            const categoryMatch = itemHtml.match(/<div class="categories-wrap">([\s\S]*?)<\/div>/);

            if (!titleMatch || !imgMatch || !categoryMatch) return;

            const href = `${titleMatch[1].trim()}?video_index=2`;
            const title = titleMatch[2].trim();
            const imageUrl = imgMatch[1].trim();
            const categories = categoryMatch[1].toLowerCase();

            if (categories.includes("movie")) {
                results.push({ title, image: imageUrl, href });
            }
        });

        console.log(JSON.stringify(results));
        return JSON.stringify(results);
    } catch (error) {
        throw error;
    }
}

async function extractDetails(url) {
    details.push({
        description: `Weirdly the website doesn't provide any description, either that or I'm blind.`,
        alias: 'N/A',
        airdate: 'N/A'
    });

    console.log(JSON.stringify(details));
    return details;
}

async function extractEpisodes(url) {
    const response = await fetch(url);
    const html = await response;
    const episodes = [];

    const hrefMatch = html.match(/<iframe[^>]+src="([^"]+)"[^>]*>/);

    if (hrefMatch) {
        episodes.push({
            href: hrefMatch[1].trim(),
            number: 1
        });
    }

    console.log(JSON.stringify(episodes));
    return JSON.stringify(episodes);
}

async function extractStreamUrl(url) {
    const embedResponse = await fetch(url);
    const data = await embedResponse; 

    const obfuscatedScript = data.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d.*?\)[\s\S]*?)<\/script>/);

    const unpackedScript = unpack(obfuscatedScript[1]);

    const m3u8Match = unpackedScript.match(/file:"(https?:\/\/.*?\.m3u8.*?)"/);

    const m3u8Url = m3u8Match[1];
    console.log(m3u8Url);
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
