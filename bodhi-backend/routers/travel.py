"""
routers/travel.py
Real flight search via RapidAPI (Sky Scrapper / Flights API) + airport autocomplete.
"""
import os
import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from services.auth_service import get_current_user
from models.core import User

logger = logging.getLogger(__name__)
router = APIRouter()

# ─── API Keys ─────────────────────────────────────────────────────────────────
RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")
RAPIDAPI_HOST = os.environ.get("RAPIDAPI_FLIGHT_HOST", "sky-scrapper.p.rapidapi.com")


# ─── Schemas ──────────────────────────────────────────────────────────────────

class FlightSearchRequest(BaseModel):
    origin_sky_id: str          # e.g. "DEL"
    destination_sky_id: str     # e.g. "BOM"
    origin_entity_id: str       # e.g. "95673320"
    destination_entity_id: str  # e.g. "95673529"
    travel_date: str            # YYYY-MM-DD
    adults: int = 1
    cabin_class: str = "economy"  # economy, premium_economy, business, first
    currency: str = "INR"

class PriceCalendarRequest(BaseModel):
    origin_sky_id: str
    destination_sky_id: str
    from_date: str
    currency: str = "INR"

class FlightDetailsRequest(BaseModel):
    itinerary_id: str
    legs: str
    session_id: str
    adults: int = 1
    cabin_class: str = "economy"
    currency: str = "INR"


import time

# ─── Simple In-Memory Caches ──────────────────────────────────────────────────
# To prevent exhausting the RapidAPI free tier limit
_airport_cache = {}
_flight_cache = {}
CACHE_TTL = 3600  # 1 hour

def _get_from_cache(cache_dict, key):
    if key in cache_dict:
        val, ts = cache_dict[key]
        if time.time() - ts < CACHE_TTL:
            return val
    return None

def _set_to_cache(cache_dict, key, val):
    cache_dict[key] = (val, time.time())

# ─── Airport / City Autocomplete ─────────────────────────────────────────────

@router.get("/airports/search")
async def search_airports(
    query: str = Query(..., min_length=2, description="City or airport name"),
    current_user: User = Depends(get_current_user),
):
    """
    Search airports/cities using Sky Scrapper API on RapidAPI.
    Returns a list of airports with skyId and entityId needed for flight search.
    """
    cache_key = query.lower().strip()
    cached_result = _get_from_cache(_airport_cache, cache_key)
    if cached_result:
        logger.info(f"Returning cached airports for query: {query}")
        return cached_result

    if not RAPIDAPI_KEY:
        raise HTTPException(status_code=503, detail="RapidAPI key not configured. Add RAPIDAPI_KEY to .env")

    url = f"https://{RAPIDAPI_HOST}/api/v1/flights/searchAirport"
    headers = {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
    }
    params = {"query": query, "locale": "en-US"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.get(url, headers=headers, params=params)
            
            # Try parsing JSON immediately
            try:
                data = resp.json()
            except Exception:
                if "Access to this page has been denied" in resp.text:
                    raise HTTPException(status_code=403, detail="RapidAPI blocked the request (Bot Protection/Captcha).")
                raise HTTPException(status_code=502, detail="Invalid response from RapidAPI.")
                
            # Check for RapidAPI embedded error message even on 200 OK
            if isinstance(data, dict) and "message" in data:
                # E.g. "You have exceeded the MONTHLY quota..."
                raise HTTPException(status_code=429, detail=data["message"])

            resp.raise_for_status()
            
        except httpx.HTTPStatusError as e:
            try:
                err_data = e.response.json()
                msg = err_data.get("message", f"API Error: {e.response.status_code}")
            except:
                msg = f"API Error: {e.response.status_code}"
            logger.error(f"RapidAPI airport search error: {msg}")
            raise HTTPException(status_code=e.response.status_code, detail=msg)

    raw_results = data.get("data", [])
    airports = []
    for item in raw_results:
        presentation = item.get("presentation", {})
        navigation = item.get("navigation", {})
        entity_info = navigation.get("relevantFlightParams", {})

        airports.append({
            "sky_id": entity_info.get("skyId", item.get("skyId", "")),
            "entity_id": entity_info.get("entityId", item.get("entityId", "")),
            "title": presentation.get("title", ""),
            "subtitle": presentation.get("subtitle", ""),
            "subtitle_short": presentation.get("suggestionTitle", presentation.get("subtitle", "")),
            "type": navigation.get("entityType", ""),
        })

    result = {"results": airports}
    _set_to_cache(_airport_cache, cache_key, result)
    return result


# ─── Flight Search ────────────────────────────────────────────────────────────

@router.post("/flights/search")
async def search_flights(
    req: FlightSearchRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Search one-way flights using Sky Scrapper on RapidAPI.
    Returns a list of flight itineraries with price, duration, stops, and airlines.
    """
    cache_key = f"{req.origin_sky_id}-{req.destination_sky_id}-{req.travel_date}-{req.adults}-{req.cabin_class}"
    cached_result = _get_from_cache(_flight_cache, cache_key)
    if cached_result:
        logger.info(f"Returning cached flights for: {cache_key}")
        return cached_result

    if not RAPIDAPI_KEY:
        raise HTTPException(status_code=503, detail="RapidAPI key not configured. Add RAPIDAPI_KEY to .env")

    url = f"https://{RAPIDAPI_HOST}/api/v2/flights/searchFlights"
    headers = {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
    }
    params = {
        "originSkyId": req.origin_sky_id,
        "destinationSkyId": req.destination_sky_id,
        "originEntityId": req.origin_entity_id,
        "destinationEntityId": req.destination_entity_id,
        "date": req.travel_date,
        "adults": str(req.adults),
        "cabinClass": req.cabin_class,
        "currency": req.currency,
        "market": "IN",
        "countryCode": "IN",
    }

    data = {}
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(url, headers=headers, params=params)
            
            # Try parsing JSON immediately
            try:
                data = resp.json()
            except Exception:
                if "Access to this page has been denied" in resp.text:
                    raise HTTPException(status_code=403, detail="RapidAPI blocked the request (Bot Protection/Captcha).")
                raise HTTPException(status_code=502, detail="Invalid response from RapidAPI.")
                
            # Check for RapidAPI embedded error message even on 200 OK
            if isinstance(data, dict) and "message" in data:
                # E.g. "You have exceeded the MONTHLY quota..."
                raise HTTPException(status_code=429, detail=data["message"])

            resp.raise_for_status()
            
        except httpx.HTTPStatusError as e:
            try:
                err_data = e.response.json()
                msg = err_data.get("message", f"API Error: {e.response.status_code}")
            except:
                msg = f"API Error: {e.response.status_code}"
            logger.error(f"RapidAPI flight search error: {msg}")
            raise HTTPException(status_code=e.response.status_code, detail=msg)

    # Parse the response into a clean format
    itineraries_raw = data.get("data", {}).get("itineraries", []) if isinstance(data, dict) else []
    flights = []

    if not itineraries_raw:
        logger.warning("RapidAPI returned 0 itineraries (possibly blocked by Captcha or invalid date).")
    else:
        for itin in itineraries_raw[:20]:  # Cap at 20 results
            price_info = itin.get("price", {})
            legs = itin.get("legs", [])
            if not legs:
                continue

            leg = legs[0]
            origin = leg.get("origin", {})
            destination = leg.get("destination", {})
            carriers = leg.get("carriers", {}).get("marketing", [])
            segments = leg.get("segments", [])

            airline_name = carriers[0].get("name", "Unknown") if carriers else "Unknown"
            airline_logo = carriers[0].get("logoUrl", "") if carriers else ""

            flights.append({
                "id": itin.get("id", ""),
                "price": price_info.get("formatted", ""),
                "price_raw": price_info.get("raw", 0),
                "airline": airline_name,
                "airline_logo": airline_logo,
                "departure": leg.get("departure", ""),
                "arrival": leg.get("arrival", ""),
                "duration_minutes": leg.get("durationInMinutes", 0),
                "stops": leg.get("stopCount", 0),
                "origin_code": origin.get("displayCode", ""),
                "origin_name": origin.get("name", ""),
                "dest_code": destination.get("displayCode", ""),
                "dest_name": destination.get("name", ""),
                "segments_count": len(segments),
                "cabin_class": req.cabin_class,
            })

    # Sort by price
    flights.sort(key=lambda x: x.get("price_raw", 99999))

    result = {
        "origin": req.origin_sky_id,
        "destination": req.destination_sky_id,
        "date": req.travel_date,
        "results_count": len(flights),
        "flights": flights,
        "session_id": data.get("sessionId", "mock-session-id") if isinstance(data, dict) else "mock-session-id"
    }
    _set_to_cache(_flight_cache, cache_key, result)
    return result

# ─── Price Calendar ───────────────────────────────────────────────────────────

@router.post("/flights/price-calendar")
async def get_price_calendar(
    req: PriceCalendarRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Get a price calendar for flights.
    """
    cache_key = f"calendar-{req.origin_sky_id}-{req.destination_sky_id}-{req.from_date}-{req.currency}"
    cached_result = _get_from_cache(_flight_cache, cache_key)
    if cached_result:
        logger.info(f"Returning cached calendar for: {cache_key}")
        return cached_result

    if not RAPIDAPI_KEY:
        raise HTTPException(status_code=503, detail="RapidAPI key not configured.")

    url = f"https://{RAPIDAPI_HOST}/api/v1/flights/getPriceCalendar"
    headers = {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
    }
    params = {
        "originSkyId": req.origin_sky_id,
        "destinationSkyId": req.destination_sky_id,
        "fromDate": req.from_date,
        "currency": req.currency,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(url, headers=headers, params=params)
            
            # Try parsing JSON immediately
            try:
                data = resp.json()
            except Exception:
                if "Access to this page has been denied" in resp.text:
                    raise HTTPException(status_code=403, detail="RapidAPI blocked the request (Bot Protection/Captcha).")
                raise HTTPException(status_code=502, detail="Invalid response from RapidAPI.")
                
            # Check for RapidAPI embedded error message even on 200 OK
            if isinstance(data, dict) and "message" in data:
                raise HTTPException(status_code=429, detail=data["message"])

            resp.raise_for_status()
            
        except httpx.HTTPStatusError as e:
            try:
                err_data = e.response.json()
                msg = err_data.get("message", f"API Error: {e.response.status_code}")
            except:
                msg = f"API Error: {e.response.status_code}"
            logger.error(f"RapidAPI price calendar error: {msg}")
            raise HTTPException(status_code=e.response.status_code, detail=msg)

    _set_to_cache(_flight_cache, cache_key, data)
    return data

# ─── Flight Details ───────────────────────────────────────────────────────────

@router.post("/flights/details")
async def get_flight_details(
    req: FlightDetailsRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Get full flight details (baggage, exact times, etc).
    """
    cache_key = f"details-{req.itinerary_id}-{req.session_id}-{req.adults}-{req.cabin_class}"
    cached_result = _get_from_cache(_flight_cache, cache_key)
    if cached_result:
        logger.info(f"Returning cached details for: {cache_key}")
        return cached_result

    if not RAPIDAPI_KEY:
        raise HTTPException(status_code=503, detail="RapidAPI key not configured.")

    url = f"https://{RAPIDAPI_HOST}/api/v1/flights/getFlightDetails"
    headers = {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
    }
    params = {
        "itineraryId": req.itinerary_id,
        "legs": req.legs,
        "sessionId": req.session_id,
        "adults": str(req.adults),
        "cabinClass": req.cabin_class,
        "currency": req.currency,
        "market": "IN",
        "countryCode": "IN",
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(url, headers=headers, params=params)
            
            # Try parsing JSON immediately
            try:
                data = resp.json()
            except Exception:
                if "Access to this page has been denied" in resp.text:
                    raise HTTPException(status_code=403, detail="RapidAPI blocked the request (Bot Protection/Captcha).")
                raise HTTPException(status_code=502, detail="Invalid response from RapidAPI.")
                
            # Check for RapidAPI embedded error message even on 200 OK
            if isinstance(data, dict) and "message" in data:
                raise HTTPException(status_code=429, detail=data["message"])

            resp.raise_for_status()
            
        except httpx.HTTPStatusError as e:
            try:
                err_data = e.response.json()
                msg = err_data.get("message", f"API Error: {e.response.status_code}")
            except:
                msg = f"API Error: {e.response.status_code}"
            logger.error(f"RapidAPI flight details error: {msg}")
            raise HTTPException(status_code=e.response.status_code, detail=msg)

    _set_to_cache(_flight_cache, cache_key, data)
    return data
