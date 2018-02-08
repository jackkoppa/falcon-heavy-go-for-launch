/*
*
* Instructions
*
*/
// 1. Go to the reddit thread w/ locations: https://www.reddit.com/r/spacex/comments/7vg63x/rspacex_falcon_heavy_test_flight_official_launch/dttm08w/
// 2. Copy this entire file (CTRL + A, CTRL + C)
// 3. Paste into dev tools console (https://developers.google.com/web/tools/chrome-devtools/console/), press "Enter" 
// 4. Wait for final message saying "Coordinates are ready!"
// 5. Paste into `../manually-retrieved-coordinates.js` file, replacing everything (CTRL + A, CTRL + V)

// Can use when running locally, as the key is not domain-controlled
// However, it's possible to exceed the daily limit, so you may want to generate your own key if you see network requests fail,
// https://developers.google.com/maps/documentation/geocoding/start, "GET A KEY"
const GEOCODE_KEY = 'AIzaSyBffhukdBQU5DXDmp3cqyQJeqcVaZpAPZw' 
const GEO_URL = 'https://maps.googleapis.com/maps/api/geocode/json?';
const GEO_API_MS_DELAY = 21 ;// Geocoding API is rate-limited; we need to delay our requests to stay under 50 per second
const COMMENT_REG_EXPS = [
    // (City Name, State Name, Country Name, More Names) {is|was|is a|was a} go {anything else}
    new RegExp(/([\w\u00C0-\u017E][\w\u00C0-\u017E\s\,]+)(?:[iI][sS]|[wW][aA][sS])(?:\s+[aA])*\s+[gG][oO].*/), 
    // (City Name, State Name, Country Name, More Names) - GO {anything else}
    new RegExp(/([\w\u00C0-\u017E][\w\u00C0-\u017E\s\,]+)[\s\.\,\-]+[gG][oO].*/), 
    // (CityName, CountryName) {anything else}
    new RegExp(/([\w\u00C0-\u017E]+,\s[\w\u00C0-\u017E]+)\s.*/) 
]
const COMMENT_MS_INTERVAL = 100; // how many milliseconds to wait before checking again if comments are loaded

var HttpClient = function() {
    this.get = function(aUrl, aCallback) {
        var anHttpRequest = new XMLHttpRequest();
        anHttpRequest.onreadystatechange = function() { 
            if (anHttpRequest.readyState == 4 && anHttpRequest.status == 200)
                aCallback(anHttpRequest.responseText);
        }

        anHttpRequest.open( "GET", aUrl, true );            
        anHttpRequest.send( null );
    }
}

let comments = [];
let coordinates = [];
let client = new HttpClient();

let findAncestor = (el, cls) => {
    while ((el = el.parentElement) && !el.classList.contains(cls));
    return el;
}

let intervalsWaited = 0;
let totalIntervalsWaited = 0;
let clickComments = (spans) => {
    let moreCommentsLinks = spans[spans.length - 1].getElementsByTagName('a');
    let link = moreCommentsLinks && moreCommentsLinks[0]
    if (link.innerText != 'loading...' || intervalsWaited >= 10) {
        link.click();
        intervalsWaited = 0;
    }
}

let waitForAllComments = new Promise(resolve => {
    console.group('Clicking "More Comments" until all comments are loaded')
    let copyFn = window.copy;
    let interval = setInterval(function() {        
        console.log(`have waited ${totalIntervalsWaited * COMMENT_MS_INTERVAL} for comments to load`);
        intervalsWaited++;
        totalIntervalsWaited++;
        let moreCommentsSpans = document.getElementsByClassName('morecomments');
        if (!moreCommentsSpans || moreCommentsSpans.length === 0 ) {
            console.groupEnd();
            console.log('Finished getting all comments');
            clearInterval(interval);
            addComments();            
            resolve(copyFn);
        } else {
            clickComments(moreCommentsSpans);
        }
    }, COMMENT_MS_INTERVAL)
});

let addComments = () => {
    let userElements = document.getElementsByClassName('usertext-body');
    
    Array.prototype.forEach.call(userElements, element => {
        let pTags = element.getElementsByTagName('p');
        let parentEntry = element.closest('div.entry');
        let tagline = parentEntry && parentEntry.getElementsByClassName('tagline');
        let authorTags = tagline && tagline[0] && tagline[0].getElementsByClassName('author');
        let flatList = parentEntry && parentEntry.getElementsByClassName('flat-list');
        let byLinkTags = flatList && flatList[0] && flatList[0].getElementsByClassName('bylink');
        
        if (pTags[0] && pTags[0].innerText) {
            let newComment = {
                text: pTags[0].innerText,
                user: authorTags && authorTags[0] && authorTags[0].innerText,
                link: byLinkTags && byLinkTags[0] && byLinkTags[0].href
            }
            comments.push(newComment)
        };
    });
}

let getCoordinates = (copyFn) => {
    console.log('Now determining correct comments to get coordinates for');

    let matchedComments = comments.map(comment => {
        let pattern = COMMENT_REG_EXPS.find(regExp => {
            let match = regExp.exec(comment.text);
            return match && match[1]
        });
        let confirmedMatch = pattern && pattern.exec(comment.text);
        let newComment = {};
        newComment.original = confirmedMatch && 
            confirmedMatch[1] &&
            confirmedMatch[1]
                .trim()
                .replace(/\,$/, '') || // remove trailing commas
            undefined;
        newComment.formatted = confirmedMatch && 
            confirmedMatch[1] && 
            confirmedMatch[1]
                .trim()
                .replace(/[\.\,\-\s]+/g, '+') || 
            undefined;
        newComment.user = comment.user;
        newComment.link = comment.link;
        return newComment;
    });

    let filteredComments = matchedComments.filter(comment => comment.formatted != null);
    console.log(`${filteredComments.length} matched, filtered comments`);
    

    console.group('Retrieving coordinates from Google Geocoding API');
    filteredComments.forEach((comment, index) => {
        let requestURL = `${GEO_URL}address=${filteredComments[index].formatted}&key=${GEOCODE_KEY}`;
        setTimeout(() => {
            client.get(requestURL, (response) => {
                if (response) {
                    try {
                        let parsed = JSON.parse(response);
                        if (parsed.status == 'OK') {
                            let result = parsed.results[0];
                            let coords = {
                                redditAddress: filteredComments[index].original,
                                formattedAddress: result.formatted_address,
                                location: result.geometry.location,
                                user: filteredComments[index].user,
                                link: filteredComments[index].link
                            };
                            coords.redditAddress = filteredComments[index].original;
                            coords.formattedAddress = result.formatted_address;
                            coords.location = result.geometry.location;
                            coordinates.push(coords);                       
                        }                          
                    }
                    catch (err) {
                        console.error(`Failed to push response coordinates with err: ${err}`);
                    }
                }            
            });
            if (index % 10 == 0) console.log(`Have requested coordinates for ${index} total comments`);
        }, GEO_API_MS_DELAY * index)
    });

    let finalCopyFn = copyFn;
    setTimeout(() => {
        console.groupEnd();
        let copyString = `const COORDINATES = ${JSON.stringify(coordinates)}; 
        const UPDATED_DATE = "${new Date().toUTCString()}"`
        finalCopyFn(copyString);
        console.log('Coordinates are ready!');
        console.log(`Retrieved ${coordinates.length} total coordinates`);
        console.log('You can now Paste into the `../manually-retrieved-coordinates.js` file');
    }, GEO_API_MS_DELAY * filteredComments.length + 3000) // delay by total execution time, + a buffer
}

waitForAllComments.then((copyFn) => {
    getCoordinates(copyFn);
});