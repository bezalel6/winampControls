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
import { openImageModal } from "@utils/discord";
import { ContextMenuApi, Menu, React, useState } from "@webpack/common";

import { debugLog } from "../debugLog";
import { type Track } from "../WinampStore";

const cl = classNameFactory("vc-winamp-");

// Default placeholder for when album art is not available
const DEFAULT_ALBUM_ART = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' fill='%23666'%3E%3Crect width='48' height='48' fill='%232f3136'/%3E%3Ccircle cx='24' cy='24' r='16' fill='none' stroke='%23444' stroke-width='2'/%3E%3Ccircle cx='24' cy='24' r='6' fill='%23444'/%3E%3C/svg%3E";

// Persist expanded state across track changes
let persistedCoverExpanded = false;

function AlbumContextMenu({ track, albumArtUrl }: { track: Track; albumArtUrl: string; }) {
    const hasAlbumArt = albumArtUrl !== DEFAULT_ALBUM_ART;

    return (
        <Menu.Menu
            navId="winamp-album-menu"
            onClose={() => ContextMenuApi.closeContextMenu()}
            aria-label="Winamp Album Menu"
        >
            {hasAlbumArt && (
                <Menu.MenuItem
                    key="view-cover"
                    id="view-cover"
                    label="View Album Cover"
                    action={() => openImageModal({ url: albumArtUrl })}
                />
            )}
            {track.album && (
                <Menu.MenuItem
                    key="album-info"
                    id="album-info"
                    label={`Album: ${track.album}`}
                    disabled={true}
                />
            )}
            {track.year && (
                <Menu.MenuItem
                    key="year-info"
                    id="year-info"
                    label={`Year: ${track.year}`}
                    disabled={true}
                />
            )}
            {track.genre && (
                <Menu.MenuItem
                    key="genre-info"
                    id="genre-info"
                    label={`Genre: ${track.genre}`}
                    disabled={true}
                />
            )}
        </Menu.Menu>
    );
}

export function TrackInfo({ track }: { track: Track; }) {
    const trackName = track.name || "Unknown";
    const artistName = track.artist || "Unknown Artist";
    const [imageError, setImageError] = useState(false);
    const [coverExpanded, setCoverExpanded] = useState(persistedCoverExpanded);

    const albumArtUrl = (!imageError && track.albumArt) ? track.albumArt : DEFAULT_ALBUM_ART;
    const hasAlbumArt = albumArtUrl !== DEFAULT_ALBUM_ART;

    debugLog("TrackInfo", `Render: track.albumArt=${track.albumArt ? `${track.albumArt.substring(0, 50)}...` : "undefined"}, imageError=${imageError}`);

    const handleImageError = () => {
        debugLog("TrackInfo", `Image load error for: ${track.albumArt}`);
        setImageError(true);
    };

    const handleImageClick = () => {
        if (hasAlbumArt) {
            const newState = !coverExpanded;
            setCoverExpanded(newState);
            persistedCoverExpanded = newState;
        }
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        ContextMenuApi.openContextMenu(e, () => (
            <AlbumContextMenu track={track} albumArtUrl={albumArtUrl} />
        ));
    };

    // Reset error state when track changes (but keep expanded state)
    React.useEffect(() => {
        debugLog("TrackInfo", `Track changed, resetting error state. New track: "${track.artist}" - "${track.name}", albumArt=${track.albumArt ? "present" : "undefined"}`);
        setImageError(false);
    }, [track.id]);

    const albumImage = (
        <img
            id={cl("album-image")}
            src={albumArtUrl}
            alt={track.album ? `${track.album} album art` : "Album art"}
            onError={handleImageError}
            onClick={handleImageClick}
            onContextMenu={handleContextMenu}
            draggable={false}
        />
    );

    // Expanded view - show full-width album art
    if (coverExpanded && hasAlbumArt) {
        return (
            <div id={cl("album-expanded-wrapper")}>
                {albumImage}
            </div>
        );
    }

    // Normal view - album art + track info
    return (
        <div id={cl("info-wrapper")}>
            {albumImage}
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
