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

export async function httpQRequest(_: IpcMainInvokeEvent, host: string, port: number, password: string, command: string, arg?: string): Promise<{ status: number; data: string; }> {
    const baseUrl = `http://${host}:${port}/${command}`;
    const params = new URLSearchParams();

    if (password) {
        params.append("p", password);
    }

    if (arg) {
        // Handle named parameters for specific commands
        if (arg.includes("=")) {
            // Parse named parameters (e.g., "level=50", "ms=1000", "enable=1")
            const [name, value] = arg.split("=", 2);
            params.append(name, value);
        } else {
            // For simple numeric arguments (like getoutputtime with "1" or "2")
            params.append("a", arg);
        }
    }

    const url = `${baseUrl}?${params.toString()}`;

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
