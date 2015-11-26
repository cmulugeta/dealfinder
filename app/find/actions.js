import queryString from 'query-string';

import { apiHost, apiBaseAddress } from '../shared/constants';
import navigateTo from '../shared/router/routerActions';

// Actions
export const CATEGORIES_REQUEST = 'CATEGORIES_REQUEST';
export const CATEGORIES_SUCCESS = 'CATEGORIES_SUCCESS';
export const CATEGORIES_ERROR = 'CATEGORIES_ERROR';

export const SELECT_CATEGORY = 'SELECT_CATEGORY';
export const RESET_CATEGORY = 'RESET_CATEGORY';

export const PRICEGUIDES_BY_CATEGORY_REQUEST = 'PRICEGUIDES_BY_CATEGORY_REQUEST';
export const PRICEGUIDES_BY_CATEGORY_SUCCESS = 'PRICEGUIDES_BY_CATEGORY_SUCCESS';
export const PRICEGUIDES_BY_CATEGORY_ERROR = 'PRICEGUIDES_BY_CATEGORY_ERROR';

export const DEALS_LISTINGS_REQUEST = 'DEALS_LISTINGS_REQUEST';
export const DEALS_LISTINGS_SUCCESS = 'DEALS_LISTINGS_SUCCESS';
export const DEALS_LISTINGS_ERROR = 'DEALS_LISTINGS_ERROR';

export const DEALS_BY_CATEGORY_START = 'DEALS_BY_CATEGORY_START';
export const DEALS_BY_CATEGORY_ERROR = 'DEALS_BY_CATEGORY_ERROR';

export const DEALS_MORE = 'DEALS_MORE';

export const PRICEGUIDES_MORE_REQUEST = 'PRICEGUIDES_MORE_REQUEST';
export const PRICEGUIDES_MORE_SUCCESS = 'PRICEGUIDES_MORE_SUCCESS';
export const PRICEGUIDES_MORE_ERROR = 'PRICEGUIDES_MORE_ERROR';

export const DEALS_RESET = 'DEALS_RESET';

export const RESET_ERROR_MESSAGE = 'RESET_ERROR_MESSAGE';

// Action creators
function selectCategory(category) {
  return {
    type: SELECT_CATEGORY,
    category: category
  }
}

function dealsByCategoryStart() {
  return {
    type: DEALS_BY_CATEGORY_START
  }
}

function dealsByCategoryError(error) {
  return {
    type: DEALS_BY_CATEGORY_ERROR,
    error: error
  }
}

function getPriceGuidesByCategory(category) {
  return {
    types: [PRICEGUIDES_BY_CATEGORY_REQUEST, PRICEGUIDES_BY_CATEGORY_SUCCESS, PRICEGUIDES_BY_CATEGORY_ERROR],
    shouldCallApi: state => 
      !state.finder.priceGuides || 
      !state.finder.priceGuides.byCategory[category] || 
      (!state.finder.priceGuides.byCategory[category].isFetching && state.finder.priceGuides.byCategory[category].didInvalidate),
    callApi: () => fetch(apiBaseAddress + '/priceguide' + encodeURI(`?product_type=${category}`)),
    payload: {
      category: category
    }
  };
}

function getDealsForPriceGuide(priceGuide) {
  const identifier = priceGuide._links.self.href;
  const make = priceGuide.make;
  const model = priceGuide.model;
  const finish = priceGuide.finish;
  const year = priceGuide.year;
  let decade = '';
  let yearFrom = '';
  let yearTo = '';

  // Year returned from API can be something like '2010s' or the exact year. 
  // When an exact year is returned we're going to look for items that are approximately the same age (± 5 years).
  if (isNaN(year)) {
    decade = year;
  } else {
    yearFrom = (parseInt(year) - 5).toString();
    yearTo = (parseInt(year) + 5).toString();
  }

  // Check if estimated_value exists at all
  if (priceGuide.estimated_value === undefined) {
    return {
      type: DEALS_LISTINGS_ERROR,
      error: `No estimated value found for ${identifier}`
    };
  }

  // An listing is a good deal when the price is not higher than 20% of the lowest price
  let maxPrice = parseInt(priceGuide.estimated_value.bottom_price) * 1.1;
  const topPrice = parseInt(priceGuide.estimated_value.top_price);
  if (maxPrice > topPrice) {
    maxPrice = topPrice;
  }  
  const url = apiBaseAddress + encodeURI(`/listings?finish=${finish}&make=${make}&model=${model}&price_max=${maxPrice}&year_max=${yearTo}&year_min=${yearFrom}&decade=${decade}`);

  return {
    types: [DEALS_LISTINGS_REQUEST, DEALS_LISTINGS_SUCCESS, DEALS_LISTINGS_ERROR],
    shouldCallApi: state => 
      !state.finder.dealsListings || 
      !state.finder.dealsListings[identifier] || 
      (!state.finder.dealsListings[identifier].isFetching && state.finder.dealsListings[identifier].didInvalidate),
    callApi: () => fetch(url),
    transformResult: json => { 
      return json.listings.map(listing => { 
        return { 
          link: listing._links.web.href, 
          title: listing.title, 
          shop: listing.shop_name,
          created: listing.created_at,
          condition: listing.condition,
          price: listing.price,
          thumbnail: listing.photos.length > 0 ? listing.photos[0]._links.thumbnail.href : null,
          priceGuideLink: identifier,
          bottom: priceGuide.estimated_value.bottom_price,
          top: priceGuide.estimated_value.top_price
        };
      });
    },
    payload: {
      priceGuide: identifier
    }
  };
}

function canGetMorePriceGuides(state) {
  const { searchTerm, selectedCategory, priceGuides } = state.finder;
  if (searchTerm) {
    return priceGuides.bySeachTerm.next !== null && ! priceGuides.bySearchTerm.isFetching;
  }
  if (selectedCategory) {
    return priceGuides.byCategory[selectedCategory].next !== null &&
      ! priceGuides.byCategory[selectedCategory].isFetching;
  }
  return false;
}

function getMorePriceGuides(state) {
  const { searchTerm, selectedCategory, priceGuides } = state.finder;

  if (searchTerm) {
    // TODO
    return;
  }
  if (selectedCategory) {
    const priceGuidesForCategory = priceGuides.byCategory[selectedCategory];
    const nextLinkParams = queryString.parse(queryString.extract(priceGuidesForCategory.next));
    const maxItemsAfterNextFetch = parseInt(nextLinkParams.page) * parseInt(nextLinkParams.per_page);
    const nextLink = apiHost + priceGuidesForCategory.next;
    
    return {
      types: [PRICEGUIDES_BY_CATEGORY_REQUEST, PRICEGUIDES_BY_CATEGORY_SUCCESS, PRICEGUIDES_BY_CATEGORY_ERROR],
      shouldCallApi: state => ! priceGuidesForCategory.isFetching && 
        priceGuidesForCategory.items.length < maxItemsAfterNextFetch &&
        priceGuidesForCategory.items.length < 75, // Be a little gentle on the Reverb API
      callApi: () => fetch(nextLink),
      payload: {
        category: selectedCategory
      }
    };    
  } 
}

export function fetchCategoriesIfNeeded() {
  return {
    types: [CATEGORIES_REQUEST, CATEGORIES_SUCCESS, CATEGORIES_ERROR],
    shouldCallApi: state => 
      !state.finder.categories || 
      state.finder.categories.items.length === 0 || 
      (!state.finder.categories.isFetching && state.finder.categories.didInvalidate),
    callApi: () => fetch(apiBaseAddress + '/categories'),
    transformResult: json => { 
      return json.categories.map(cat => { 
        return { id: cat.id, name: cat.name, slug: cat.slug, description: cat.description, image: cat._links.image.href } 
      })
    },
    payload: {}
  };
}

export function findDealsForCategory(category) {
  return (dispatch, getState) => {
    return dispatch(dispatch => {
      dispatch(selectCategory(category));
      dispatch(dealsByCategoryStart())
      dispatch(getPriceGuidesByCategory(category))
        .then(priceGuidesResult => {
          if (priceGuidesResult) {
            priceGuidesResult.data.price_guides.forEach(priceGuide => {
              dispatch(getDealsForPriceGuide(priceGuide));
            });            
          }
          dispatch(navigateTo('/deals'));
        })
        .catch(error => {
          dispatch(dealsByCategoryError(error));
        });
    });
  }
}

export function findMoreDeals() {
  console.log('Moar deals!');
  return (dispatch, getState) => {
    if (canGetMorePriceGuides(getState())) {
      return dispatch(dispatch => {
        dispatch(getMorePriceGuides(getState()))
          .then(priceGuidesResult => {
            if (priceGuidesResult) {
              priceGuidesResult.data.price_guides.forEach(priceGuide => {
                dispatch(getDealsForPriceGuide(priceGuide));
              });            
            }
          })
          .catch(error => {
            dispatch(dealsByCategoryError(error));
          });
      });
    } else {
      return Promise.resolve();
    }
  }
}

export function resetCategory() {
  return {
    type: RESET_CATEGORY
  }
}