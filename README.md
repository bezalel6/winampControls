# WinampControls

Control Winamp directly from Discord with a sleek player interface displayed above your account panel.

## Overview

WinampControls adds a fully functional Winamp player interface to Discord, allowing you to control your music without leaving the application. The plugin communicates with Winamp through the HttpQ plugin to provide real-time synchronization and responsive controls.

## Features

### 🎵 **Media Controls**
- **Play/Pause** - Toggle playback with instant visual feedback
- **Previous/Next** - Navigate through your playlist
- **Volume Control** - Adjust volume with a smooth slider
- **Seek Bar** - Jump to any position in the current track (optional)
- **Repeat Modes** - Cycle through off/single/playlist repeat
- **Shuffle** - Toggle shuffle mode on/off

### 🎨 **UI Customization**
- **Hover Controls** - Show controls only when hovering over the player
- **Previous Button Behavior** - Choose whether previous button restarts the current track (if >3s elapsed) or always goes to previous track
- **Seeker Bar Toggle** - Show or hide the seek/progress bar
- **Responsive Design** - Automatically adapts to Discord's theme

### ⚡ **Performance Features**
- **Optimistic Updates** - Controls respond instantly, even before Winamp confirms the action
- **Real-time Sync** - Player state updates automatically every second
- **Error Recovery** - Automatic reconnection after connection failures
- **Connection Testing** - Built-in connection tester in settings

## Requirements

### Winamp Setup
1. **Winamp** - Any modern version of Winamp
2. **HttpQ Plugin** - Required for API communication
   - Download from: [HttpQ Plugin](https://github.com/losnoco/httpq)
   - Or check Winamp's plugin directory for "gen_httpq.dll"

### HttpQ Configuration
1. Install the HttpQ plugin in your Winamp plugins directory
2. Configure HttpQ in Winamp:
   - Go to **Preferences → General → Plugins → General Purpose**
   - Find and configure **HttpQ Server**
   - Set your desired port (default: 4800)
   - Set a password (default: "pass")
   - Enable the server

## Setup Instructions

### 1. Install HttpQ Plugin
```
1. Download gen_httpq.dll
2. Place it in your Winamp/Plugins directory
3. Restart Winamp
4. Go to Preferences → General → Plugins → General Purpose
5. Find "HttpQ Server" and click Configure
```

### 2. Configure HttpQ Server
```
Host: 127.0.0.1 (localhost)
Port: 4800 (or your preferred port)
Password: pass (or your preferred password)
Enable Server: ✓
```

### 3. Configure WinampControls Plugin
1. Open Vencord settings
2. Navigate to **Plugins → WinampControls**
3. In the **HttpQ Server Configuration** section:
   - **Host**: Enter your HttpQ server IP (usually `127.0.0.1`)
   - **Port**: Enter your HttpQ server port (usually `4800`)
   - **Password**: Enter your HttpQ server password
4. Click **Test Connection** to verify the setup
5. ✅ You should see "Connected" if everything is configured correctly

### 4. Restart Vencord
**Important**: You must restart Vencord after changing HttpQ configuration for the changes to take effect.

## Configuration Options

### UI Customization
- **Hover controls**: Show player controls only when hovering over the player area
- **Previous restarts track**: When enabled, the previous button will restart the current track if more than 3 seconds have elapsed; otherwise, it goes to the previous track
- **Show seeker**: Display the seek/progress bar for track navigation

### HttpQ Server Settings
- **Host**: IP address or hostname of the HttpQ server (default: `127.0.0.1`)
- **Port**: Port number of the HttpQ server (default: `4800`)
- **Password**: Authentication password for the HttpQ server (default: `pass`)

## Troubleshooting

### "✗ Failed" Connection Test
1. **Check Winamp is running** with a track loaded
2. **Verify HttpQ plugin is installed** and enabled
3. **Check HttpQ server settings** in Winamp preferences
4. **Ensure port is not blocked** by firewall
5. **Try different ports** if 4800 is in use

### Player Not Showing
- **Load a track in Winamp** - The player only appears when Winamp has a track loaded
- **Check connection** - Use the Test Connection button in settings
- **Restart Vencord** after configuration changes

### Controls Not Responding
1. **Check optimistic updates** - Controls should respond immediately, then sync with Winamp
2. **Monitor console** for error messages (F12 → Console)
3. **Verify HttpQ server is running** in Winamp
4. **Test manual connection** by visiting `http://localhost:4800` in a browser

### Connection Keeps Dropping
- **Check HttpQ plugin stability** - Some versions may be more stable than others
- **Monitor consecutive failures** - Plugin automatically attempts reconnection
- **Restart Winamp** if HttpQ becomes unresponsive

## Technical Details

### Communication Protocol
- Uses HTTP requests to communicate with Winamp's HttpQ plugin
- Implements optimistic UI updates for responsive controls
- Polls Winamp state every 1000ms for real-time synchronization
- Handles connection failures with automatic retry logic

### Supported Winamp Features
- Playback control (play, pause, stop)
- Track navigation (previous, next)
- Volume adjustment (0-100%)
- Seek/position control
- Repeat modes (off, single track, playlist)
- Shuffle toggle
- Track information display

### Performance Optimizations
- **Optimistic Updates**: UI responds immediately to user actions
- **Conflict Resolution**: Server state takes priority over optimistic updates
- **Efficient Polling**: Only updates changed values
- **Error Handling**: Graceful degradation when Winamp is unavailable

## Contributing

If you encounter issues or have suggestions for improvements, please report them to the Vencord project. The plugin supports standard Winamp functionality through the HttpQ API, so most Winamp features should work seamlessly.

## Credits

- **Author**: RNDev
- **Based on**: SpotifyControls plugin - This plugin adapts the SpotifyControls functionality for Winamp
- **HttpQ Plugin**: Required third-party plugin for Winamp API access
- **Vencord**: Plugin framework and Discord modification platform
