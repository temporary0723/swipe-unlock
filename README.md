# Swipe Unlock Extension

A SillyTavern extension that allows users to unlock and navigate through swipes of historical messages, not just the last message.

## Features

- **🔓 Unlock Historical Messages**: Click the lock icon on any message to unlock swipe navigation
- **🔄 Full Swipe Navigation**: Navigate through all available swipes using intuitive left/right buttons
- **🎯 Original Swipe Highlighting**: The originally selected swipe is highlighted with a special color
- **🌐 Translation Support**: Toggle between original and translated text using the language button
- **⚠️ Conflict Prevention**: Prevents multiple messages from being unlocked simultaneously
- **📱 Mobile Friendly**: Responsive design that works on all device sizes

## How to Use

### Basic Usage

1. **Unlock a Message**: Click the 🔒 lock icon next to any message that has multiple swipes
2. **Navigate Swipes**: Use the ← → buttons to browse through different swipe versions
3. **View Counter**: The counter shows current swipe position (e.g., "2/5")
4. **Toggle Translation**: Click the 🌐 language icon to switch between original and translated text
5. **Lock Message**: Click the 🔓 unlock icon to lock the message and return to normal state

### Visual Indicators

- **🔒 Locked Icon**: Message swipes are locked (default state)
- **🔓 Unlocked Icon**: Message swipes are accessible for navigation
- **Highlighted Counter**: Original swipe number is shown in quote color
- **🌐 Translation Toggle**: Shows active (colored) when translation is enabled
- **Border Highlight**: Unlocked messages have a colored left border

### Safety Features

- **Single Message Unlock**: Only one message can be unlocked at a time
- **Conflict Prevention**: Warns when trying to unlock multiple messages

## Installation

1. Copy the `swipe-unlock` folder to your SillyTavern extensions directory
2. Restart SillyTavern or reload the page
3. The extension will automatically load and add lock icons to all messages

## Technical Details

### File Structure
```
swipe-unlock/
├── index.js          # Main extension logic
├── style.css         # Styling and visual effects
├── manifest.json     # Extension metadata
└── README.md         # This documentation
```

### Key Functions

- **Message Lock/Unlock**: Toggle swipe navigation access
- **Swipe Navigation**: Navigate through historical swipes
- **Translation Integration**: Access LLM Translator database for translated content
- **State Management**: Track unlocked messages and original swipe positions
- **Conflict Detection**: Prevent multiple operations simultaneously
- **UI Integration**: Seamlessly integrate with SillyTavern's interface

### CSS Classes

- `.swipe-unlock-icon`: Lock/unlock button styling
- `.swipe-unlocked`: Applied to unlocked messages
- `.swipe-unlock-navigation`: Swipe navigation container
- `.swipe-unlock-btn`: Navigation button styling
- `.swipe-unlock-counter`: Swipe counter display
- `.swipe-unlock-translation-toggle`: Translation toggle button
- `.original-swipe`: Highlights the original swipe

## Compatibility

- **SillyTavern Version**: Compatible with current SillyTavern releases
- **Other Extensions**: Works alongside other SillyTavern extensions
- **LLM Translator**: Integrates with LLM Translator extension for translation features
- **Themes**: Adapts to all SillyTavern themes (light/dark mode)
- **Mobile**: Responsive design for mobile devices

## Limitations

- Only one message can be unlocked at a time
- Keyboard navigation is disabled to prevent conflicts with last message
- Changes to historical swipes are temporary (not permanently saved)
- Requires messages to have multiple swipes to be functional

## Troubleshooting

### Common Issues

1. **Lock icon not appearing**: Refresh the page or check if message has multiple swipes
2. **Navigation buttons disabled**: Ensure you're at a valid swipe position
3. **Cannot unlock message**: Check if another message is already unlocked
4. **Toast warnings**: Follow the instructions to lock current message first

### Reset Extension

If the extension gets stuck in an unusual state:
1. Refresh the SillyTavern page
2. The extension will reset to default locked state

## Version History

### v1.0.0
- Initial release
- Basic lock/unlock functionality
- Swipe navigation for historical messages
- Conflict prevention system
- Mobile responsive design

## Contributing

This extension is part of a collection of SillyTavern enhancements. Feel free to modify and improve the code to suit your needs.

## License

This extension is provided as-is for educational and enhancement purposes. Use at your own discretion.