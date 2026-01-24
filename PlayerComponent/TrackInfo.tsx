/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { classNameFactory } from "@api/Styles";
import { React, useState } from "@webpack/common";

import { type Track } from "../WinampStore";

const cl = classNameFactory("vc-winamp-");

// Default placeholder for when album art is not available
const DEFAULT_ALBUM_ART = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' fill='%23666'%3E%3Crect width='48' height='48' fill='%232f3136'/%3E%3Ccircle cx='24' cy='24' r='16' fill='none' stroke='%23444' stroke-width='2'/%3E%3Ccircle cx='24' cy='24' r='6' fill='%23444'/%3E%3C/svg%3E";

export function TrackInfo({ track }: { track: Track; }) {
    const trackName = track.name || "Unknown";
    const artistName = track.artist || "Unknown Artist";
    const [imageError, setImageError] = useState(false);

    const albumArtUrl = (!imageError && track.albumArt) ? track.albumArt : DEFAULT_ALBUM_ART;

    // Debug logging
    console.log(`[TrackInfo] Render: track.albumArt=${track.albumArt ?? "undefined"}, imageError=${imageError}, using=${albumArtUrl.substring(0, 50)}...`);

    const handleImageError = () => {
        console.log(`[TrackInfo] Image load error for: ${track.albumArt}`);
        setImageError(true);
    };

    // Reset error state when track changes
    React.useEffect(() => {
        console.log(`[TrackInfo] Track changed, resetting error state. New track: "${track.artist}" - "${track.name}", albumArt=${track.albumArt ?? "undefined"}`);
        setImageError(false);
    }, [track.id]);

    return (
        <div id={cl("info-wrapper")}>
            <img
                id={cl("album-image")}
                src={albumArtUrl}
                alt={track.album ? `${track.album} album art` : "Album art"}
                onError={handleImageError}
                draggable={false}
            />
            <div id={cl("titles")}>
                <div id={cl("song-title")} className={cl("ellipoverflow")}>
                    {trackName}
                </div>
                <div className={cl("ellipoverflow")}>
                    <span className={cl("artist")}>{artistName}</span>
                </div>
            </div>
        </div>
    );
}
