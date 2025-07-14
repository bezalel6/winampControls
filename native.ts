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

import { IpcMainInvokeEvent } from "electron";

// Simplified native fetch wrapper - just does HTTP requests
export async function httpQRequest(_: IpcMainInvokeEvent, url: string): Promise<{ status: number; data: string; }> {
    try {
        const response = await fetch(url);
        const data = await response.text();

        return {
            status: response.status,
            data
        };
    } catch (error) {
        console.error(`[WinampControls] httpQ request failed: ${error}`);
        return {
            status: -1,
            data: String(error)
        };
    }
}
