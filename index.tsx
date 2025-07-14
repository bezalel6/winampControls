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

import { definePluginSettings } from "@api/Settings";
import { disableStyle, enableStyle } from "@api/Styles";
import ErrorBoundary from "@components/ErrorBoundary";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";

import hoverOnlyStyle from "./hoverOnly.css?managed";
import { Player } from "./PlayerComponent";
import { WinampStore } from "./WinampStore";

function toggleHoverControls(value: boolean) {
    (value ? enableStyle : disableStyle)(hoverOnlyStyle);
}

function updateHttpQConfig() {
    WinampStore.configure({
        host: settings.store.httpqHost,
        port: settings.store.httpqPort,
        password: settings.store.httpqPassword
    });
}

export const settings = definePluginSettings({
    hoverControls: {
        description: "Show controls on hover",
        type: OptionType.BOOLEAN,
        default: false,
        onChange: v => toggleHoverControls(v)
    },
    previousButtonRestartsTrack: {
        type: OptionType.BOOLEAN,
        description: "Restart currently playing track when pressing the previous button if playtime is >3s",
        default: true
    },
    httpqHost: {
        type: OptionType.STRING,
        description: "HttpQ server host/IP address",
        default: "127.0.0.1",
        onChange: updateHttpQConfig
    },
    httpqPort: {
        type: OptionType.NUMBER,
        description: "HttpQ server port",
        default: 4800,
        onChange: updateHttpQConfig
    },
    httpqPassword: {
        type: OptionType.STRING,
        description: "HttpQ server password",
        default: "pass",
        onChange: updateHttpQConfig
    }
});

export default definePlugin({
    name: "WinampControls",
    description: "Adds a Winamp player above the account panel",
    authors: [Devs.RNDev],
    settings,
    native: {
        httpQRequest: "httpQRequest"
    },
    patches: [
        {
            find: "this.isCopiedStreakGodlike",
            replacement: {
                // react.jsx)(AccountPanel, { ..., showTaglessAccountPanel: blah })
                match: /(?<=\i\.jsxs?\)\()(\i),{(?=[^}]*?userTag:\i,hidePrivateData:)/,
                // react.jsx(WrapperComponent, { VencordOriginal: AccountPanel, ...
                replace: "$self.PanelWrapper,{VencordOriginal:$1,"
            }
        }
    ],

    start: () => {
        toggleHoverControls(settings.store.hoverControls);
        updateHttpQConfig();
    },

    PanelWrapper({ VencordOriginal, ...props }) {
        return (
            <>
                <ErrorBoundary
                    fallback={() => (
                        <div className="vc-winamp-fallback">
                            <p>Failed to render Winamp Modal :(</p>
                            <p>Check the console for errors</p>
                        </div>
                    )}
                >
                    <Player />
                </ErrorBoundary>

                <VencordOriginal {...props} />
            </>
        );
    }
});
