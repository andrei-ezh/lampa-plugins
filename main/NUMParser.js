(function () {
    'use strict';

    var DEFAULT_SOURCE_NAME = 'NUMParser';
    var SOURCE_NAME = Lampa.Storage.get('numparser_source_name', DEFAULT_SOURCE_NAME);
    var newName = SOURCE_NAME;
    var BASE_URL = 'https://num.jac-red.ru';
    var ICON = '<svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="enable-background:new 0 0 512 512;" xml:space="preserve"><g><g><path fill="currentColor" d="M482.909,67.2H29.091C13.05,67.2,0,80.25,0,96.291v319.418C0,431.75,13.05,444.8,29.091,444.8h453.818c16.041,0,29.091-13.05,29.091-29.091V96.291C512,80.25,498.95,67.2,482.909,67.2z M477.091,409.891H34.909V102.109h442.182V409.891z"/></g></g><g><g><rect fill="currentColor" x="126.836" y="84.655" width="34.909" height="342.109"/></g></g><g><g><rect fill="currentColor" x="350.255" y="84.655" width="34.909" height="342.109"/></g></g><g><g><rect fill="currentColor" x="367.709" y="184.145" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="17.455" y="184.145" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="367.709" y="292.364" width="126.836" height="34.909"/></g></g><g><g><rect fill="currentColor" x="17.455" y="292.364" width="126.836" height="34.909"/></g></g></svg>';
    var DEFAULT_MIN_PROGRESS = 90;
    var MIN_PROGRESS = Lampa.Storage.get('numparser_min_progress', DEFAULT_MIN_PROGRESS);
    var newProgress = MIN_PROGRESS;


    function filterWatchedContent(results) {

        var hideWatched = Lampa.Storage.get('numparser_hide_watched', false);

        var hieroglyphRegex = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/;

        var favorite_raw = Lampa.Storage.get('favorite', '{}');
        var favorite = favorite_raw;
        try {
            if (typeof favorite_raw === 'string') {
                favorite = JSON.parse(favorite_raw || '{}');
            }
        } catch (e) {
            favorite = {};
        }

        if (!favorite || typeof favorite !== 'object') favorite = {};
        if (!Array.isArray(favorite.card)) favorite.card = [];

        var timeTable = Lampa.Storage.cache('timetable', 300, []);

        return results.filter(function (item) {
            if (!item) return true;

            var title =
                item.title ||
                item.name ||
                item.original_title ||
                item.original_name ||
                '';

            if (hieroglyphRegex.test(title)) {
                return false;
            }

            if (!hideWatched) return true;

            var mediaType = (item.first_air_date || item.number_of_seasons) ? 'tv' : 'movie';

            var checkItem = {
                id: item.id,
                media_type: mediaType,
                original_title: item.original_title || item.original_name || '',
                title: item.title || item.name || '',
                original_language: item.original_language || 'en',
                poster_path: item.poster_path || '',
                backdrop_path: item.backdrop_path || ''
            };

            var favoriteItem = Lampa.Favorite.check(checkItem);
            var watched = !!favoriteItem && !!favoriteItem.history;
            var thrown = !!favoriteItem && favoriteItem.thrown;

            if (thrown) return false;
            if (!watched) return true;

            if (watched && mediaType === 'movie') {
                var hashes = [];

                if (item.id) hashes.push(Lampa.Utils.hash(String(item.id)));
                if (item.original_title) hashes.push(Lampa.Utils.hash(item.original_title));

                var hasProgress = false;

                for (var i = 0; i < hashes.length; i++) {
                    var view = Lampa.Storage.cache('file_view', 300, [])[hashes[i]];
                    if (view) {
                        hasProgress = true;
                        if (!view.percent || view.percent >= MIN_PROGRESS) {
                            return false;
                        }
                    }
                }

                if (!hasProgress) return false;
                return true;
            }

            if (mediaType === 'tv') {
                var historyEpisodes = getEpisodesFromHistory(item.id, favorite);
                var timeTableEpisodes = getEpisodesFromTimeTable(item.id, timeTable);
                var releasedEpisodes = mergeEpisodes(historyEpisodes, timeTableEpisodes);

                return !allEpisodesWatched(
                    item.original_title || item.original_name || item.title || item.name,
                    releasedEpisodes
                );
            }

            return true;
        });
    }


    function getEpisodesFromHistory(id, favorite) {
        if (!favorite || !Array.isArray(favorite.card)) return [];

        var historyCard = favorite.card.filter(function (card) {
            return card.id === id && Array.isArray(card.seasons) && card.seasons.length > 0;
        })[0];

        if (!historyCard) {
            return [];
        }

        var realSeasons = historyCard.seasons.filter(function (season) {
            return season.season_number > 0
                && season.episode_count > 0
                && season.air_date
                && new Date(season.air_date) < new Date();
        });

        if (realSeasons.length === 0) {
            return [];
        }

        var seasonEpisodes = [];
        for (var seasonIndex = 0; seasonIndex < realSeasons.length; seasonIndex++) {
            var season = realSeasons[seasonIndex];

            for (var episodeIndex = 1; episodeIndex <= season.episode_count; episodeIndex++) {
                seasonEpisodes.push({
                    season_number: season.season_number,
                    episode_number: episodeIndex
                });
            }
        }

        return seasonEpisodes;
    }

    function getEpisodesFromTimeTable(id, timeTable) {
        if (!Array.isArray(timeTable)) return [];

        var serial = timeTable.find(function (item) {
            return item.id === id && Array.isArray(item.episodes);
        });

        return serial ? serial.episodes.filter(function (episode) {
            return episode.season_number > 0 &&
                episode.air_date &&
                new Date(episode.air_date) < new Date();
        }) : [];
    }

    function mergeEpisodes(arr1, arr2) {
        var merged = arr1.concat(arr2);
        var unique = [];

        merged.forEach(function (episode) {
            if (!unique.some(function (e) {
                return e.season_number === episode.season_number &&
                    e.episode_number === episode.episode_number;
            })) {
                unique.push(episode);
            }
        });

        return unique;
    }

    function allEpisodesWatched(title, episodes) {
        if (!episodes || !episodes.length) return false;

        return episodes.every(function (episode) {
            var hash = Lampa.Utils.hash([
                episode.season_number,
                episode.season_number > 10 ? ':' : '',
                episode.episode_number,
                title
            ].join(''));

            var view = Lampa.Timeline.view(hash);
            return view.percent > MIN_PROGRESS;
        });
    }


    var currentYear = new Date().getFullYear();

    function isYearVisible(year) {
        if (year >= 1980 && year <= 1989) return CATEGORY_VISIBILITY.year_1980_1989.visible;
        if (year >= 1990 && year <= 1999) return CATEGORY_VISIBILITY.year_1990_1999.visible;
        if (year >= 2000 && year <= 2009) return CATEGORY_VISIBILITY.year_2000_2009.visible;
        if (year >= 2010 && year <= 2019) return CATEGORY_VISIBILITY.year_2010_2019.visible;
        if (year >= 2020 && year <= currentYear) return CATEGORY_VISIBILITY.year_2020_current.visible;
        return false;
    }



    var CATEGORY_VISIBILITY = {
        legends: {
            title: '–Ґ–Њ–њ —Д–Є–ї—М–Љ—Л',
            visible: Lampa.Storage.get('numparser_category_legends', true)
        },
        k4_new: {
            title: '–Т –≤—Л—Б–Њ–Ї–Њ–Љ –Ї–∞—З–µ—Б—В–≤–µ (–љ–Њ–≤—Л–µ)',
            visible: Lampa.Storage.get('numparser_category_k4_new', true)
        },
        movies_new: {
            title: '–Э–Њ–≤—Л–µ —Д–Є–ї—М–Љ—Л',
            visible: Lampa.Storage.get('numparser_category_movies_new', true)
        },
        russian_new_movies: {
            title: '–Э–Њ–≤—Л–µ —А—Г—Б—Б–Ї–Є–µ —Д–Є–ї—М–Љ—Л',
            visible: Lampa.Storage.get('numparser_category_russian_new_movies', true)
        },
        all_tv: {
            title: '–°–µ—А–Є–∞–ї—Л',
            visible: Lampa.Storage.get('numparser_category_all_tv', true)
        },
        russian_tv: {
            title: '–†—Г—Б—Б–Ї–Є–µ —Б–µ—А–Є–∞–ї—Л',
            visible: Lampa.Storage.get('numparser_category_russian_tv', true)
        },
        anime: {
            title: '–Р–љ–Є–Љ–µ',
            visible: Lampa.Storage.get('numparser_category_anime', true)
        },
        k4: {
            title: '–Т –≤—Л—Б–Њ–Ї–Њ–Љ –Ї–∞—З–µ—Б—В–≤–µ',
            visible: Lampa.Storage.get('numparser_category_k4', true)
        },
        movies: {
            title: '–§–Є–ї—М–Љ—Л',
            visible: Lampa.Storage.get('numparser_category_movies', true)
        },
        russian_movies: {
            title: '–†—Г—Б—Б–Ї–Є–µ —Д–Є–ї—М–Љ—Л',
            visible: Lampa.Storage.get('numparser_category_russian_movies', true)
        },
        cartoons: {
            title: '–Ь—Г–ї—М—В—Д–Є–ї—М–Љ—Л',
            visible: Lampa.Storage.get('numparser_category_cartoons', true)
        },
        cartoons_tv: {
            title: '–Ь—Г–ї—М—В—Б–µ—А–Є–∞–ї—Л',
            visible: Lampa.Storage.get('numparser_category_cartoons_tv', true)
        },

        year_1980_1989: {
            title: '–§–Є–ї—М–Љ—Л 1980-1989',
            visible: Lampa.Storage.get('numparser_year_1980_1989', false)
        },
        year_1990_1999: {
            title: '–§–Є–ї—М–Љ—Л 1990-1999',
            visible: Lampa.Storage.get('numparser_year_1990_1999', false)
        },
        year_2000_2009: {
            title: '–§–Є–ї—М–Љ—Л 2000-2009',
            visible: Lampa.Storage.get('numparser_year_2000_2009', false)
        },
        year_2010_2019: {
            title: '–§–Є–ї—М–Љ—Л 2010-2019',
            visible: Lampa.Storage.get('numparser_year_2010_2019', true)
        },
        year_2020_current: {
            title: '–§–Є–ї—М–Љ—Л 2020-' + currentYear,
            visible: Lampa.Storage.get('numparser_year_2020_current', true)
        }
    };


    var CATEGORY_SETTINGS_ORDER = [
        'k4_new',
        'movies_new',
        'movies',
        'russian_new_movies',
        'russian_movies',
        'all_tv',
        'russian_tv',
        'k4',
        'legends',
        'cartoons',
        'cartoons_tv',
        'anime',

        'year_2020_current',
        'year_2010_2019',
        'year_2000_2009',
        'year_1990_1999',
        'year_1980_1989'
    ];


    var CATEGORIES = {
        k4: 'lampac_movies_4k',
        k4_new: 'lampac_movies_4k_new',
        movies_new: "lampac_movies_new",
        movies: 'lampac_movies',
        russian_new_movies: 'lampac_movies_ru_new',
        russian_movies: 'lampac_movies_ru',
        cartoons: 'lampac_all_cartoon_movies',
        cartoons_tv: 'lampac_all_cartoon_series',
        all_tv: 'lampac_all_tv_shows',
        russian_tv: 'lampac_all_tv_shows_ru',
        legends: 'legends_id',
        anime: 'anime_id',
    };


    for (var year = 1980; year <= currentYear; year++) {
        CATEGORIES['movies_id_' + year] = 'movies_id_' + year;
    }

    function NumparserApiService() {
        var self = this;
        self.network = new Lampa.Reguest();
        self.discovery = false;

        function normalizeData(json) {
	            function numparser_to_https_url(v) {
	                if (!v || typeof v !== 'string') return '';
	                if (/^https?:\/\//i.test(v)) return v.replace(/^http:\/\//i, 'https://');
	                if (/^\/\//.test(v)) return 'https:' + v;
	                return '';
	            }
	            function numparser_to_tmdb_path(v) {
	                if (!v || typeof v !== 'string') return '';
	                if (/^https?:\/\//i.test(v)) {
	                    var u = v.replace(/^http:\/\//i, 'https://');
	                    var m = u.match(/^https?:\/\/(?:image\.tmdb\.org|www\.themoviedb\.org)\/(t\/p\/[^?#]+)/i);
	                    return m && m[1] ? '/' + m[1] : '';
	                }
	                if (v.charAt(0) === '/') return v;
	                return '';
	            }
            var normalized = {
                results: (json.results || []).map(function (item) {
                    var np_poster_path = numparser_to_tmdb_path(item.poster_path) || numparser_to_tmdb_path(item.poster) || numparser_to_tmdb_path(item.img);
                    var np_poster_url = numparser_to_https_url(item.poster_path) || numparser_to_https_url(item.poster) || numparser_to_https_url(item.img);
                    var np_backdrop_path = numparser_to_tmdb_path(item.backdrop_path) || numparser_to_tmdb_path(item.backdrop) || numparser_to_tmdb_path(item.background_image);
                    var np_backdrop_url = numparser_to_https_url(item.backdrop_path) || numparser_to_https_url(item.backdrop) || numparser_to_https_url(item.background_image);
                    var np_img = numparser_to_https_url(item.img) || item.img;
                    var dataItem = {
                        id: item.id,
                        poster_path: np_poster_path || '',
                        img: np_poster_url || np_img,
                        overview: item.overview || item.description || '',
                        vote_average: item.vote_average || 0,
                        backdrop_path: np_backdrop_path || '',
                        background_image: np_backdrop_url || item.background_image,
                        source: Lampa.Storage.get('numparser_source_name') || SOURCE_NAME,
                        type: (item.first_air_date || item.number_of_seasons) ? 'tv' : 'movie',

                        original_title: item.original_title || item.original_name || '',
                        title: item.title || item.name || '',
                        original_language: item.original_language || 'en',
                        first_air_date: item.first_air_date,
                        number_of_seasons: item.number_of_seasons,
                        status: item.status || '',
                    };

                    if (item.release_quality) dataItem.release_quality = item.release_quality;
                    if (item.release_date) dataItem.release_date = item.release_date;
                    if (item.last_air_date) dataItem.last_air_date = item.last_air_date;
                    if (item.last_episode_to_air) dataItem.last_episode_to_air = item.last_episode_to_air;

                    dataItem.promo_title = dataItem.title || dataItem.name || dataItem.original_title || dataItem.original_name;
                    dataItem.promo = dataItem.overview;

                    return dataItem;
                }),
                page: json.page || 1,
                total_pages: json.total_pages || json.pagesCount || 1,
                total_results: json.total_results || json.total || 0
            };


            normalized.results = filterWatchedContent(normalized.results);
            return normalized;
        }

        self.get = function (url, params, onComplete, onError) {
            self.network.silent(url, function (json) {
                if (!json) {
                    onError(new Error('Empty response from server'));
                    return;
                }
                var normalizedJson = normalizeData(json);
                onComplete(normalizedJson);
            }, function (error) {
                onError(error);
            });
        };

        self.list = function (params, onComplete, onError) {
            params = params || {};
            onComplete = onComplete || function () {
            };
            onError = onError || function () {
            };

            var category = params.url || CATEGORIES.movies_new;
            var page = params.page || 1;
            var url = BASE_URL + '/' + category + '?page=' + page + '&language=' + Lampa.Storage.get('tmdb_lang', 'ru');

            self.get(url, params, function (json) {
                onComplete({
                    results: json.results || [],
                    page: json.page || page,
                    total_pages: json.total_pages || 1,
                    total_results: json.total_results || 0
                });
            }, onError);
        };

        self.full = function (params, onSuccess, onError) {
            var card = params.card;
            params.method = !!(card.number_of_seasons || card.seasons || card.first_air_date) ? 'tv' : 'movie';
            Lampa.Api.sources.tmdb.full(params, onSuccess, onError);
        }

        self.category = function (params, onSuccess, onError) {
            params = params || {};

            var partsData = [];


            if (CATEGORY_VISIBILITY.k4_new.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.k4_new, CATEGORY_VISIBILITY.k4_new.title, callback);
            });
            if (CATEGORY_VISIBILITY.movies_new.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.movies_new, CATEGORY_VISIBILITY.movies_new.title, callback);
            });
            if (CATEGORY_VISIBILITY.movies.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.movies, CATEGORY_VISIBILITY.movies.title, callback);
            });
            if (CATEGORY_VISIBILITY.russian_new_movies.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.russian_new_movies, CATEGORY_VISIBILITY.russian_new_movies.title, callback);
            });
            if (CATEGORY_VISIBILITY.russian_movies.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.russian_movies, CATEGORY_VISIBILITY.russian_movies.title, callback);
            });
            if (CATEGORY_VISIBILITY.all_tv.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.all_tv, CATEGORY_VISIBILITY.all_tv.title, callback);
            });
            if (CATEGORY_VISIBILITY.russian_tv.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.russian_tv, CATEGORY_VISIBILITY.russian_tv.title, callback);
            });            if (CATEGORY_VISIBILITY.k4.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.k4, CATEGORY_VISIBILITY.k4.title, callback);
            });
            if (CATEGORY_VISIBILITY.legends.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.legends, CATEGORY_VISIBILITY.legends.title, callback);
            });
            if (CATEGORY_VISIBILITY.cartoons.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.cartoons, CATEGORY_VISIBILITY.cartoons.title, callback);
            });
            if (CATEGORY_VISIBILITY.cartoons_tv.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.cartoons_tv, CATEGORY_VISIBILITY.cartoons_tv.title, callback);
            });
            if (CATEGORY_VISIBILITY.anime.visible) partsData.push(function (callback) {
                makeRequest(CATEGORIES.anime, CATEGORY_VISIBILITY.anime.title, callback);
            });


            for (var year = currentYear; year >= 1980; year--) {
                if (isYearVisible(year)) {
                    (function (y) {
                        partsData.push(function (callback) {
                            makeRequest(CATEGORIES['movies_id_' + y], '–§–Є–ї—М–Љ—Л ' + y + ' –≥–Њ–і–∞', callback);
                        });
                    })(year);
                }
            }

            function makeRequest(category, title, callback) {
                var page = params.page || 1;
                var url = BASE_URL + '/' + category + '?page=' + page + '&language=' + Lampa.Storage.get('tmdb_lang', 'ru');

                self.get(url, params, function (json) {
                    var filteredResults = json.results || [];
                    var totalResults = json.total_results || 0;
                    var totalPages = json.total_pages || 1;


                    if (filteredResults.length < (json.results || []).length) {
                        totalResults = totalResults - ((json.results || []).length - filteredResults.length);

                        totalPages = Math.ceil(totalResults / 20);
                    }

                    var result = {
                        url: category,
                        title: title,
                        page: page,
                        total_results: totalResults,
                        total_pages: totalPages,
                        more: totalPages > page,
                        results: filteredResults,
                        source: Lampa.Storage.get('numparser_source_name') || SOURCE_NAME,
                        _original_total_results: json.total_results || 0,
                        _original_total_pages: json.total_pages || 1,
                        _original_results: json.results || []
                    };
                    callback(result);
                }, function (error) {
                    callback({error: error});
                });
            }

            function loadPart(partLoaded, partEmpty) {
                Lampa.Api.partNext(partsData, 5, function (result) {
                    partLoaded(result);
                }, function (error) {
                    partEmpty(error);
                });
            }

            loadPart(onSuccess, onError);
            return loadPart;
        };

        Lampa.Listener.follow('line', async function (event) {
            if (event.type !== 'append') return;
            var data = event.data;
            if (!data || !Array.isArray(data.results)) return;
            var desiredCount = 20;
            var allResults = filterWatchedContent(data.results).filter(function (item) {
                return item && item.id && (item.title || item.name || item.original_title || item.original_name);
            });
            var page = data.page || 1;
            var totalPages = data._original_total_pages || data.total_pages || 1;
            var source = data.source;
            var url = data.url;

            while (allResults.length < desiredCount && page < totalPages) {
                page++;
                var params = {url: url, page: page, source: source};

                await new Promise(function (resolve) {
                    Lampa.Api.sources[source].list(params, function (response) {
                        if (response && Array.isArray(response.results)) {
                            var filtered = filterWatchedContent(response.results).filter(function (item) {
                                return item && item.id && (item.title || item.name || item.original_title || item.original_name);
                            });
                            allResults = allResults.concat(filtered);
                        }
                        resolve();
                    });
                });
            }

            allResults = allResults.slice(0, desiredCount);
            data.results = allResults;
            data.page = page;
            data.more = page < totalPages && allResults.length === desiredCount;
            if (event.line && event.line.update) {
                event.line.update();
            }
        });
    }


	function numparser_img(src, size) {
	    if (!src || typeof src !== 'string') return '';
	    if (/^https?:\/\//i.test(src)) return src.replace(/^http:\/\//i, 'https://');
	    if (/^\/\//.test(src)) return 'https:' + src;
	    return Lampa.Api.img(src, size);
	}

	function setImg(node, url, size) {
	    if (!node) return;
	    url = url ? numparser_img(url, size) : '/img/img_broken.svg';
	    node.onerror = function () { node.src = '/img/img_broken.svg'; };
	    node.src = url;
	}

	function FullEpisodeCard(episode, raw, title, year) {
	    var self = this;

	    self.build = function () {

            self.card = el('div', 'card full-episode selector');


            var top = el('div', 'full-episode__top');
            var imgWrap = el('div', 'full-episode__img');
            var img = el('img', '');
            imgWrap.appendChild(img);

            var info = el('div', 'full-episode__info');
            var num = el('div', 'full-episode__num');
            var name = el('div', 'full-episode__name');
            var date = el('div', 'full-episode__date');

            var s = episode.season_number || episode.season || '?';
            var e = episode.episode_number || episode.episode || '?';
            num.textContent = (e !== '?' ? e : '');
            name.textContent = episode.name || ('s' + s + 'e' + e);
            try {
                date.textContent = episode.air_date ? Lampa.Utils.parseTime(episode.air_date).full : '';
            } catch (e2) {
                date.textContent = episode.air_date || '';
            }

            info.appendChild(num);
            info.appendChild(name);
            info.appendChild(date);

            top.appendChild(imgWrap);
            top.appendChild(info);


            var bottom = el('div', 'full-episode__bottom');
            var poster = el('img', 'full-episode__poster');
            var meta = el('div', 'full-episode__meta');
            var t = el('div', 'full-episode__title');
            var y = el('div', 'full-episode__year');

            t.textContent = title;
            y.textContent = year !== '0000' ? year : '';

            meta.appendChild(t);
            meta.appendChild(y);

            bottom.appendChild(poster);
            bottom.appendChild(meta);

            self.card.appendChild(top);
            self.card.appendChild(bottom);


            self.img_episode = img;
            self.img_poster = poster;
        };

        self.visible = function () {

            var still = episode.still_path || '';
            var back = raw.backdrop_path || '';
            var poster = raw.poster_path || raw.img || '';

            setImg(self.img_episode, still || back || poster, 'w500');
            setImg(self.img_poster, raw.poster_path || raw.img || '', 'w300');

            if (self.onVisible) self.onVisible(self.card, raw);
        };

        self.create = function () {
            self.build();

            self.visible();

            self.card.addEventListener('hover:focus', function () { if (self.onFocus) self.onFocus(self.card, raw); });
            self.card.addEventListener('hover:hover', function () { if (self.onHover) self.onHover(self.card, raw); });
            self.card.addEventListener('hover:enter', function () { if (self.onEnter) self.onEnter(self.card, raw); });
        };

        self.destroy = function () {
            if (self.img_poster) self.img_poster.src = '';
            if (self.img_episode) self.img_episode.src = '';
            if (self.card) self.card.remove();
            self.card = null;
        };

        self.render = function (js) {
            return js ? self.card : $(self.card);
        };
    }

function startPlugin() {
        if (window.numparser_plugin) return;
        window.numparser_plugin = true;


        newName = Lampa.Storage.get('numparser_settings', SOURCE_NAME);
        if (Lampa.Storage.field('start_page') === SOURCE_NAME) {
            window.start_deep_link = {
                component: 'category',
                page: 1,
                url: '',
                source: SOURCE_NAME,
                title: SOURCE_NAME
            };
        }

        var values = Lampa.Params.values.start_page;
        values[SOURCE_NAME] = SOURCE_NAME;


        Lampa.SettingsApi.addComponent({
            component: 'numparser_settings',
            name: SOURCE_NAME,
            icon: ICON
        });


        Lampa.SettingsApi.addParam({
            component: 'numparser_settings',
            param: {
                name: 'numparser_hide_watched',
                type: 'trigger',

                default: Lampa.Storage.get('numparser_hide_watched', "false") === "true"
            },
            field: {
                name: '–°–Ї—А—Л—В—М –њ—А–Њ—Б–Љ–Њ—В—А–µ–љ–љ—Л–µ',
                description: '–°–Ї—А—Л–≤–∞—В—М –њ—А–Њ—Б–Љ–Њ—В—А–µ–љ–љ—Л–µ —Д–Є–ї—М–Љ—Л –Є —Б–µ—А–Є–∞–ї—Л'
            },

            onChange: function (value) {
                Lampa.Storage.set('numparser_hide_watched', value === true || value === "true");

                var active = Lampa.Activity.active();
                if (active && active.activity_line && active.activity_line.listener && typeof active.activity_line.listener.send === 'function') {
                    active.activity_line.listener.send({
                        type: 'append',
                        data: active.activity_line.card_data,
                        line: active.activity_line
                    });
                } else {
                    location.reload();
                }
            }
        });


        Lampa.SettingsApi.addParam({
            component: 'numparser_settings',
            param: {
                name: 'numparser_min_progress',
                type: 'select',
                values: {
                    '50': '50%',
                    '55': '55%',
                    '60': '60%',
                    '65': '65%',
                    '70': '70%',
                    '75': '75%',
                    '80': '80%',
                    '85': '85%',
                    '90': '90%',
                    '95': '95%',
                    '100': '100%'
                },
                default: DEFAULT_MIN_PROGRESS.toString()
            },
            field: {
                name: '–Я–Њ—А–Њ–≥ –њ—А–Њ—Б–Љ–Њ—В—А–∞',
                description: '–Ь–Є–љ–Є–Љ–∞–ї—М–љ—Л–є –њ—А–Њ—Ж–µ–љ—В –њ—А–Њ—Б–Љ–Њ—В—А–∞ –і–ї—П —Б–Ї—А—Л—В–Є—П –Ї–Њ–љ—В–µ–љ—В–∞'
            },
            onChange: function (value) {
                newProgress = parseInt(value);
                Lampa.Storage.set('numparser_min_progress', newProgress);
                MIN_PROGRESS = newProgress;
            }
        });


        Lampa.SettingsApi.addParam({
            component: 'numparser_settings',
            param: {
                name: 'numparser_source_name',
                type: 'input',
                placeholder: '–Т–≤–µ–і–Є—В–µ –љ–∞–Ј–≤–∞–љ–Є–µ',
                values: '',
                default: DEFAULT_SOURCE_NAME
            },
            field: {
                name: '–Э–∞–Ј–≤–∞–љ–Є–µ –Є—Б—В–Њ—З–љ–Є–Ї–∞',
                description: '–Ш–Ј–Љ–µ–љ–µ–љ–Є–µ –љ–∞–Ј–≤–∞–љ–Є—П –Є—Б—В–Њ—З–љ–Є–Ї–∞ –≤ –Љ–µ–љ—О'
            },
            onChange: function (value) {
                newName = value;
                $('.num_text').text(value);
                Lampa.Settings.update();
            }
        });


        CATEGORY_SETTINGS_ORDER.forEach(function (option) {
            if (!CATEGORY_VISIBILITY[option]) return;

            var settingName = 'numparser_settings' + option + '_visible';

            var visible = Lampa.Storage.get(settingName, "true").toString() === "true";
            CATEGORY_VISIBILITY[option].visible = visible;

            Lampa.SettingsApi.addParam({
                component: "numparser_settings",
                param: {
                    name: settingName,
                    type: "trigger",
                    default: visible
                },
                field: {
                    name: CATEGORY_VISIBILITY[option].title,
                },
                onChange: function (value) {
                    CATEGORY_VISIBILITY[option].visible = (value === true || value === "true");
                }
            });
        });

        var numparserApi = new NumparserApiService();
        Lampa.Api.sources.numparser = numparserApi;
        Object.defineProperty(Lampa.Api.sources, SOURCE_NAME, {
            get: function () {
                return numparserApi;
            }
        });

        // 1) –У–ї–∞–≤–љ–∞—П: —З—В–Њ–±—Л –њ—А–Є –≤—Л–±—А–∞–љ–љ–Њ–Љ NUMParser –љ–µ –њ–∞–і–∞–ї–Њ –Є —А–µ–і–Є—А–µ–Ї—В–Є–ї–Њ –≤ NUM category
        numparserApi.main = function (params, onComplete, onError) {
            // Lampa –≤ main() –Њ–ґ–Є–і–∞–µ—В –Љ–∞—Б—Б–Є–≤ (–Є–љ–∞—З–µ data.forEach...)
            if (typeof onComplete === 'function') onComplete([]);

            // –≤–Ї–ї—О—З–∞–µ–Љ —А–µ–і–Є—А–µ–Ї—В —В–Њ–ї—М–Ї–Њ –µ—Б–ї–Є NUMParser –≤—Л–±—А–∞–љ –Њ—Б–љ–Њ–≤–љ—Л–Љ –Є—Б—В–Њ—З–љ–Є–Ї–Њ–Љ
            try {
                var current = Lampa.Storage.get('source', 'tmdb');
                if (current !== SOURCE_NAME) return;
            } catch (e) {
                return;
            }

            // —А–µ–і–Є—А–µ–Ї—В –љ–∞ –љ–∞—И—Г –Ї–∞—В–µ–≥–Њ—А–Є—О
            setTimeout(function () {
                try {
                    Lampa.Activity.replace({
                        title: SOURCE_NAME,
                        component: 'category',
                        source: SOURCE_NAME,
                        page: 1,
                        url: ''
                    });
                } catch (e) {}
            }, 0);
        };


        // 2) –§–Є–ї—М–Љ—Л/–°–µ—А–Є–∞–ї—Л: –Њ—Б—В–∞–≤–Є—В—М TMDB, –і–∞–ґ–µ –µ—Б–ї–Є NUMParser –≤—Л–±—А–∞–љ –Њ—Б–љ–Њ–≤–љ—Л–Љ source
        (function () {
            if (window.__numparser_keep_movies_tv_tmdb) return;
            window.__numparser_keep_movies_tv_tmdb = true;

            var origPush = Lampa.Activity.push;
            var origReplace = Lampa.Activity.replace;

            function patch(params) {
                if (!params) return params;

                // —А–∞–±–Њ—В–∞–µ–Љ –Ґ–Ю–Ы–ђ–Ъ–Ю –µ—Б–ї–Є –њ–Њ–ї—М–Ј–Њ–≤–∞—В–µ–ї—М –≤—Л–±—А–∞–ї NUMParser –Ї–∞–Ї –Њ—Б–љ–Њ–≤–љ–Њ–є –Є—Б—В–Њ—З–љ–Є–Ї
                var current = Lampa.Storage.get('source', 'tmdb');
                if (current !== SOURCE_NAME) return params;

                // –§–Є–ї—М–Љ—Л/–°–µ—А–Є–∞–ї—Л –Њ–±—Л—З–љ–Њ: component:'category' + url:'movie'/'tv'
                if (params.component === 'category' && (params.url === 'movie' || params.url === 'tv')) {
                    params.source = 'tmdb';
                }

                return params;
            }

            Lampa.Activity.push = function (params) {
                return origPush.call(this, patch(params));
            };

            Lampa.Activity.replace = function (params) {
                return origReplace.call(this, patch(params));
            };
        })();




        try {
            var sources = Object.assign({}, (Lampa.Params.values && Lampa.Params.values['source']) ? Lampa.Params.values['source'] : {});
            sources[SOURCE_NAME] = SOURCE_NAME;

            // 3-–є –њ–∞—А–∞–Љ–µ—В—А вАФ –і–µ—Д–Њ–ї—В, –µ—Б–ї–Є —Г –њ–Њ–ї—М–Ј–Њ–≤–∞—В–µ–ї—П –µ—Й—С –љ–µ –≤—Л–±—А–∞–љ –Є—Б—В–Њ—З–љ–Є–Ї
            // –Њ—Б—В–∞–≤–ї—П–µ–Љ 'tmdb', —З—В–Њ–±—Л –љ–Є–Ї–Њ–Љ—Г –≤–љ–µ–Ј–∞–њ–љ–Њ –љ–µ –њ–µ—А–µ–Ї–ї—О—З–Є—В—М –њ–Њ —Г–Љ–Њ–ї—З–∞–љ–Є—О
            Lampa.Params.select('source', sources, 'tmdb');
        } catch (e) {}

        var menuItem = $('<li data-action="numparser" class="menu__item selector"><div class="menu__ico">' + ICON + '</div><div class="menu__text num_text">' + SOURCE_NAME + '</div></li>');
        $('.menu .menu__list').eq(0).append(menuItem);

        // --- –∞–≤—В–Њ-—А–µ—Д—А–µ—И "–У–ї–∞–≤–љ–Њ–є" –њ—А–Є —Б–Љ–µ–љ–µ –Њ—Б–љ–Њ–≤–љ–Њ–≥–Њ source + —Б–Ї—А—Л—В–Є–µ –њ—Г–љ–Ї—В–∞ –Љ–µ–љ—О NUM ---
        (function () {
            if (window.__numparser_source_watch) return;
            window.__numparser_source_watch = true;

            function isNumSelected() {
                return Lampa.Storage.get('source', 'tmdb') === SOURCE_NAME;
            }

            function updateNumMenuVisibility() {
                try {
                    // –µ—Б–ї–Є NUM –≤—Л–±—А–∞–љ –Њ—Б–љ–Њ–≤–љ—Л–Љ вАФ –њ—А—П—З–µ–Љ –њ—Г–љ–Ї—В –Љ–µ–љ—О NUM (—З—В–Њ–±—Л –љ–µ –і—Г–±–ї–Є—А–Њ–≤–∞–ї—Б—П)
                    // –љ–∞—Б—В—А–Њ–є–Ї–Є –њ—А–Є —Н—В–Њ–Љ –Њ—Б—В–∞—О—В—Б—П –≤ SettingsApi (–Љ—Л –Є—Е –љ–µ —В—А–Њ–≥–∞–µ–Љ)
                    if (isNumSelected()) menuItem.hide();
                    else menuItem.show();
                } catch (e) {}
            }

            // –њ–µ—А–≤–Є—З–љ–∞—П —Г—Б—В–∞–љ–Њ–≤–Ї–∞ –≤–Є–і–Є–Љ–Њ—Б—В–Є
            updateNumMenuVisibility();

            // –њ–µ—А–µ—Е–≤–∞—В –Є–Ј–Љ–µ–љ–µ–љ–Є—П Storage.source
            var origSet = Lampa.Storage.set;
            Lampa.Storage.set = function (key, value) {
                var res = origSet.apply(this, arguments);

                if (key === 'source') {
                    updateNumMenuVisibility();

                    try {
                        var active = Lampa.Activity.active && Lampa.Activity.active();
                        if (active && active.component === 'main') {

                            // –Х—Б–ї–Є –≤—Л–±—А–∞–ї–Є NUM вАФ —Б—А–∞–Ј—Г —Г—Е–Њ–і–Є–Љ –≤ NUM category (–±–µ–Ј –њ–Њ–њ—Л—В–Ї–Є –њ–µ—А–µ—Б–Њ–Ј–і–∞—В—М main)
                            if (value === SOURCE_NAME) {
                                Lampa.Activity.replace({
                                    title: SOURCE_NAME,
                                    component: 'category',
                                    source: SOURCE_NAME,
                                    page: 1,
                                    url: ''
                                });
                            }
                            // –Х—Б–ї–Є –≤–µ—А–љ—Г–ї–Є—Б—М –љ–∞ tmdb вАФ –њ–µ—А–µ—Б–Њ–±–Є—А–∞–µ–Љ –Њ–±—Л—З–љ—Г—О –≥–ї–∞–≤–љ—Г—О
                            else {
                                Lampa.Activity.replace({ component: 'main' });
                            }
                        }
                    } catch (e) {}
                }


                return res;
            };
        })();


        menuItem.on('hover:enter', function () {
            Lampa.Activity.push({
                title: SOURCE_NAME,
                component: 'category',
                source: SOURCE_NAME,
                page: 1
            });
        });
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                startPlugin();
            }
        });
    }
})();