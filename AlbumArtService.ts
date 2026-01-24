/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Album art fetching service using native layer to bypass CSP
// Routes requests through Electron main process

export interface AlbumArtResult {
    url: string;
    source: "deezer" | "itunes" | "cache";
    size: "small" | "medium" | "large";
}

// In-memory cache for album art URLs
const albumArtCache = new Map<string, AlbumArtResult>();

// Pending requests to prevent duplicate fetches
const pendingRequests = new Map<string, Promise<AlbumArtResult | null>>();

// Cache expiry time (1 hour)
const CACHE_EXPIRY_MS = 60 * 60 * 1000;
const cacheTimestamps = new Map<string, number>();

function getCacheKey(artist: string, track: string, album?: string): string {
    const normalizedArtist = artist.toLowerCase().trim();
    const normalizedTrack = track.toLowerCase().trim();
    const normalizedAlbum = album?.toLowerCase().trim();

    if (normalizedAlbum) {
        return `${normalizedArtist}::album::${normalizedAlbum}`;
    }
    return `${normalizedArtist}::track::${normalizedTrack}`;
}

function isExpired(key: string): boolean {
    const timestamp = cacheTimestamps.get(key);
    if (!timestamp) return true;
    return Date.now() - timestamp > CACHE_EXPIRY_MS;
}

function setCache(key: string, result: AlbumArtResult): void {
    albumArtCache.set(key, { ...result, source: "cache" });
    cacheTimestamps.set(key, Date.now());
}

function getFromCache(key: string): AlbumArtResult | null {
    if (isExpired(key)) {
        albumArtCache.delete(key);
        cacheTimestamps.delete(key);
        return null;
    }
    return albumArtCache.get(key) || null;
}

/**
 * Fetch album art for a track using native layer (bypasses CSP)
 * Uses Deezer → iTunes fallback chain
 * Results are cached in memory to avoid redundant API calls
 */
export async function fetchAlbumArt(
    artist: string,
    track: string,
    album?: string
): Promise<AlbumArtResult | null> {
    const logPrefix = "[AlbumArt]";

    console.log(`${logPrefix} ────────────────────────────────────────`);
    console.log(`${logPrefix} Request: artist="${artist}", track="${track}", album="${album ?? "(none)"}"`);

    // Validate inputs
    if (!artist || artist === "Unknown Artist") {
        console.log(`${logPrefix} ✗ Skipped: Invalid artist`);
        return null;
    }

    if (!track || track === "Unknown Track") {
        console.log(`${logPrefix} ✗ Skipped: Invalid track`);
        return null;
    }

    const cacheKey = getCacheKey(artist, track, album);
    console.log(`${logPrefix} Cache key: "${cacheKey}"`);

    // Check cache first
    const cached = getFromCache(cacheKey);
    if (cached) {
        console.log(`${logPrefix} ✓ Cache HIT: ${cached.url}`);
        console.log(`${logPrefix} ────────────────────────────────────────`);
        return cached;
    }
    console.log(`${logPrefix} Cache MISS`);

    // Check if there's already a pending request for this track
    const pending = pendingRequests.get(cacheKey);
    if (pending) {
        console.log(`${logPrefix} ⏳ Waiting for pending request...`);
        return pending;
    }

    console.log(`${logPrefix} Fetching via native layer...`);

    // Create new request
    const fetchPromise = (async (): Promise<AlbumArtResult | null> => {
        const startTime = Date.now();

        try {
            // Use native helper to bypass CSP
            const nativeHelper = VencordNative.pluginHelpers.WinampControls;

            if (!nativeHelper || typeof nativeHelper.fetchAlbumArt !== "function") {
                console.error(`${logPrefix} ✗ Native helper not available`);
                return null;
            }

            const response = await nativeHelper.fetchAlbumArt(artist, track, album);
            const elapsed = Date.now() - startTime;

            console.log(`${logPrefix} Native response: success=${response.success}, source=${response.source}, dataUrl=${response.dataUrl ? `${response.dataUrl.substring(0, 50)}...` : "undefined"}`);

            if (response.success && response.dataUrl) {
                const result: AlbumArtResult = {
                    url: response.dataUrl, // This is now a base64 data URL
                    source: response.source || "deezer",
                    size: "large"
                };

                setCache(cacheKey, result);
                console.log(`${logPrefix} ✓ SUCCESS: Found via ${result.source} in ${elapsed}ms`);
                console.log(`${logPrefix} ✓ Data URL length: ${result.url.length} chars`);

                return result;
            } else {
                console.log(`${logPrefix} ✗ FAILED: ${response.error || "No album art found"} (${elapsed}ms)`);
                return null;
            }
        } catch (error) {
            console.error(`${logPrefix} ✗ ERROR:`, error);
            return null;
        } finally {
            pendingRequests.delete(cacheKey);
            console.log(`${logPrefix} ────────────────────────────────────────`);
        }
    })();

    pendingRequests.set(cacheKey, fetchPromise);

    return fetchPromise;
}

/**
 * Clear the album art cache
 */
export function clearAlbumArtCache(): void {
    albumArtCache.clear();
    cacheTimestamps.clear();
    console.log("[AlbumArt] Cache cleared");
}

/**
 * Get cache statistics
 */
export function getAlbumArtCacheStats(): { size: number; pendingRequests: number; } {
    return {
        size: albumArtCache.size,
        pendingRequests: pendingRequests.size
    };
}
