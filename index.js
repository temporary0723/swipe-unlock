/**
 * Swipe Unlock Extension for SillyTavern
 * Allows unlocking swipe navigation for historical messages
 */
import {
    eventSource,
    event_types,
    chat,
    messageFormatting,
    substituteParams,
} from '../../../../script.js';

import { getContext } from '../../../extensions.js';

const pluginName = 'swipe-unlock';

// State management
let unlockedMessageId = -1; // Currently unlocked message ID
let originalSwipeId = -1; // Original swipe ID before unlock
let showTranslation = false; // Whether to show translation

// LLM Translator DB constants
const DB_NAME = 'LLMtranslatorDB';
const STORE_NAME = 'translations';

/**
 * Get chat array safely
 */
function getChatArray() {
    // Try imported chat first
    if (chat && Array.isArray(chat)) {
        return chat;
    }
    
    // Fallback to context.chat
    const context = getContext();
    return context?.chat || [];
}

/**
 * Open LLM Translator DB
 */
async function openTranslatorDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        
        request.onerror = () => {
            resolve(null); // DB가 없어도 계속 진행
        };
        
        request.onsuccess = () => {
            resolve(request.result);
        };
    });
}

/**
 * Get translation from DB by original text
 */
async function getTranslationFromDB(originalText) {
    try {
        const db = await openTranslatorDB();
        if (!db) return null;
        
        return new Promise((resolve) => {
            const transaction = db.transaction(STORE_NAME, 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const index = store.index('originalText');
            const request = index.get(originalText);
            
            request.onsuccess = (event) => {
                const record = event.target.result;
                resolve(record ? record.translation : null);
            };
            
            request.onerror = () => {
                resolve(null);
            };
            
            transaction.oncomplete = () => {
                db.close();
            };
        });
    } catch (error) {
        return null;
    }
}

/**
 * Get swipe translation
 */
async function getSwipeTranslation(messageIndex, swipeIndex) {
    try {
        const chatArray = getChatArray();
        if (messageIndex < 0 || messageIndex >= chatArray.length) {
            return null;
        }
        
        const message = chatArray[messageIndex];
        if (!message || !message.swipes || swipeIndex >= message.swipes.length) {
            return null;
        }
        
        const swipeText = message.swipes[swipeIndex];
        if (!swipeText) {
            return null;
        }
        
        // substituteParams를 사용해서 원문 처리 (LLM Translator 방식과 동일)
        const context = getContext();
        const originalText = substituteParams(swipeText, context.name1, message.name);
        
        return await getTranslationFromDB(originalText);
    } catch (error) {
        return null;
    }
}

// Action button HTML
const lockButtonHtml = `
    <div class="mes_button swipe-unlock-icon interactable fa-solid fa-lock" title="Unlock swipe navigation" tabindex="0">
    </div>
`;

/**
 * Initialize the swipe unlock extension
 */
function initializeSwipeUnlock() {
    console.log('Swipe Unlock extension loaded');
    
    // Add lock icons to existing messages
    addLockIconsToMessages();
    
    // Monitor for new messages
    setupMessageObserver();
    
    // Setup event listeners
    setupEventListeners();
}

/**
 * Add lock icons to all messages
 */
function addLockIconsToMessages() {
    $('#chat').find('.mes').each(function() {
        const messageElement = $(this);
        const extraButtonsContainer = messageElement.find('.extraMesButtons');
        
        // Add lock icon if container exists and icon doesn't exist yet
        if (extraButtonsContainer.length && !extraButtonsContainer.find('.swipe-unlock-icon').length) {
            extraButtonsContainer.prepend(lockButtonHtml);
        }
    });
}

/**
 * Setup MutationObserver to monitor for new messages
 */
function setupMessageObserver() {
    const chatContainer = document.getElementById('chat');
    if (!chatContainer) return;

    const observer = new MutationObserver((mutations) => {
        let hasNewMessages = false;
        
        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1 && 
                        (node.classList.contains('mes') || node.querySelector('.mes'))) {
                        hasNewMessages = true;
                    }
                });
            }
        });
        
        if (hasNewMessages) {
            requestAnimationFrame(() => {
                setTimeout(() => {
                    addLockIconsToMessages();
                }, 50);
            });
        }
    });
    
    observer.observe(chatContainer, {
        childList: true,
        subtree: true
    });
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Lock/unlock icon click handler
    $(document).on('click', '.swipe-unlock-icon', function(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const messageElement = $(this).closest('.mes');
        const messageId = parseInt(messageElement.attr('mesid'));
        
        if (unlockedMessageId !== -1 && unlockedMessageId !== messageId) {
            // Another message is already unlocked
            toastr.warning(`Message #${unlockedMessageId} is currently unlocked. Please lock it first before unlocking another message.`);
            return;
        }
        
        toggleMessageLock(messageId, messageElement);
    });
    
    // Custom swipe button handlers for unlocked messages
    $(document).on('click', '.swipe-unlock-left', function(event) {
        event.preventDefault();
        event.stopPropagation();
        swipeUnlockedMessage(-1);
    });
    
    $(document).on('click', '.swipe-unlock-right', function(event) {
        event.preventDefault();
        event.stopPropagation();
        swipeUnlockedMessage(1);
    });
    
    // Translation toggle handler
    $(document).on('click', '.swipe-unlock-translation-toggle', function(event) {
        event.preventDefault();
        event.stopPropagation();
        toggleTranslation();
    });
    
    // Event listeners for chat changes
    eventSource.on(event_types.MESSAGE_RECEIVED, handleChatChange);
    eventSource.on(event_types.MESSAGE_SENT, handleChatChange);
    eventSource.on(event_types.CHAT_CHANGED, handleChatChange);
}

/**
 * Toggle message lock state
 */
function toggleMessageLock(messageId, messageElement) {
    if (unlockedMessageId === messageId) {
        // Lock the message
        lockMessage(messageId, messageElement);
    } else {
        // Unlock the message
        unlockMessage(messageId, messageElement);
    }
}

/**
 * Unlock a message for swipe navigation
 */
function unlockMessage(messageId, messageElement) {
    const chatArray = getChatArray();
    const message = chatArray[messageId];
    
    // Debug logging
    console.log('=== Swipe Unlock Debug ===');
    console.log('MessageId:', messageId);
    console.log('Chat array exists:', !!chatArray);
    console.log('Chat length:', chatArray.length);
    console.log('Message exists:', !!message);
    if (message) {
        console.log('Message.swipes exists:', !!message.swipes);
        console.log('Message.swipes:', message.swipes);
        console.log('Swipes length:', message.swipes ? message.swipes.length : 'N/A');
        console.log('Message.is_user:', message.is_user);
        console.log('Message.is_system:', message.is_system);
        console.log('Message type:', message.name);
    }
    console.log('========================');
    
    if (!message) {
        toastr.info('Message not found.');
        return;
    }
    
    if (!message.swipes || message.swipes.length < 1) {
        toastr.info('This message has no swipes data.');
        return;
    }
    
    if (message.swipes.length <= 1) {
        toastr.info('This message has no additional swipes to navigate.');
        return;
    }
    
    // Store original state
    unlockedMessageId = messageId;
    originalSwipeId = message.swipe_id || 0;
    
    // Update icon
    const iconElement = messageElement.find('.swipe-unlock-icon');
    iconElement.removeClass('fa-lock').addClass('fa-lock-open');
    iconElement.attr('title', 'Lock swipe navigation');
    
    // Add swipe navigation UI
    addSwipeNavigationToMessage(messageElement, messageId);
    
    // Add unlocked class
    messageElement.addClass('swipe-unlocked');
    
    // Auto-scroll to show the navigation
    scrollToNavigator(messageElement);
    
    console.log(`Message #${messageId} unlocked for swipe navigation`);
}

/**
 * Lock a message (remove swipe navigation)
 */
function lockMessage(messageId, messageElement) {
    // Restore original swipe
    const chatArray = getChatArray();
    const message = chatArray[messageId];
    if (message) {
        message.swipe_id = originalSwipeId;
        updateMessageDisplay(messageElement, messageId, originalSwipeId);
    }
    
    // Update icon
    const iconElement = messageElement.find('.swipe-unlock-icon');
    iconElement.removeClass('fa-lock-open').addClass('fa-lock');
    iconElement.attr('title', 'Unlock swipe navigation');
    
    // Remove swipe navigation UI
    removeSwipeNavigationFromMessage(messageElement);
    
    // Remove unlocked class
    messageElement.removeClass('swipe-unlocked');
    
    // Reset state
    unlockedMessageId = -1;
    originalSwipeId = -1;
    showTranslation = false;
    
    console.log(`Message #${messageId} locked`);
}

/**
 * Add swipe navigation UI to a message
 */
function addSwipeNavigationToMessage(messageElement, messageId) {
    const chatArray = getChatArray();
    const message = chatArray[messageId];
    if (!message) return;
    
    const currentSwipeId = message.swipe_id || 0;
    const totalSwipes = message.swipes.length;
    
    // Create swipe navigation HTML
    const swipeNavHtml = `
        <div class="swipe-unlock-navigation">
            <div class="swipe-unlock-left swipe-unlock-btn" title="Previous swipe">
                <i class="fa-solid fa-chevron-left"></i>
            </div>
            <div class="swipe-unlock-counter">
                ${currentSwipeId + 1}/${totalSwipes}
            </div>
            <div class="swipe-unlock-right swipe-unlock-btn" title="Next swipe">
                <i class="fa-solid fa-chevron-right"></i>
            </div>
            <div class="swipe-unlock-translation-toggle" title="Toggle translation">
                <i class="fa-solid fa-language"></i>
            </div>
        </div>
    `;
    
    // Find insertion point (after message text)
    const mesBlock = messageElement.find('.mes_block');
    if (mesBlock.length) {
        mesBlock.append(swipeNavHtml);
    }
    
    // Update button states
    updateSwipeButtonStates(messageElement, messageId);
    
    // Highlight original swipe number
    highlightOriginalSwipe(messageElement);
}

/**
 * Remove swipe navigation UI from a message
 */
function removeSwipeNavigationFromMessage(messageElement) {
    messageElement.find('.swipe-unlock-navigation').remove();
}

/**
 * Update swipe button states (enabled/disabled)
 */
function updateSwipeButtonStates(messageElement, messageId) {
    const chatArray = getChatArray();
    const message = chatArray[messageId];
    if (!message) return;
    
    const currentSwipeId = message.swipe_id || 0;
    const totalSwipes = message.swipes.length;
    
    const leftBtn = messageElement.find('.swipe-unlock-left');
    const rightBtn = messageElement.find('.swipe-unlock-right');
    const counter = messageElement.find('.swipe-unlock-counter');
    
    // Update counter
    counter.html(`${currentSwipeId + 1}/${totalSwipes}`);
    
    // Update button states
    leftBtn.toggleClass('disabled', currentSwipeId <= 0);
    rightBtn.toggleClass('disabled', currentSwipeId >= totalSwipes - 1);
    
    // Highlight original swipe
    highlightOriginalSwipe(messageElement);
}

/**
 * Highlight the original swipe number with special color
 */
function highlightOriginalSwipe(messageElement) {
    const counter = messageElement.find('.swipe-unlock-counter');
    const chatArray = getChatArray();
    const message = chatArray[unlockedMessageId];
    if (!message) return;
    
    const currentSwipeId = message.swipe_id || 0;
    
    if (currentSwipeId === originalSwipeId) {
        counter.addClass('original-swipe');
    } else {
        counter.removeClass('original-swipe');
    }
}

/**
 * Swipe the unlocked message
 */
function swipeUnlockedMessage(direction) {
    if (unlockedMessageId === -1) return;
    
    const chatArray = getChatArray();
    const message = chatArray[unlockedMessageId];
    if (!message) return;
    
    const currentSwipeId = message.swipe_id || 0;
    const totalSwipes = message.swipes.length;
    
    let newSwipeId = currentSwipeId + direction;
    
    // Bounds check
    if (newSwipeId < 0) newSwipeId = 0;
    if (newSwipeId >= totalSwipes) newSwipeId = totalSwipes - 1;
    
    if (newSwipeId === currentSwipeId) return; // No change
    
    // Update message data
    message.swipe_id = newSwipeId;
    
    // Update UI
    const messageElement = $(`#chat .mes[mesid="${unlockedMessageId}"]`);
    updateMessageDisplay(messageElement, unlockedMessageId, newSwipeId);
    updateSwipeButtonStates(messageElement, unlockedMessageId);
    
    // Auto-scroll to keep navigation at bottom of screen
    scrollToNavigator(messageElement);
}

/**
 * Scroll to position the swipe navigator at the bottom of the screen
 */
function scrollToNavigator(messageElement) {
    // Wait for DOM updates to complete
    requestAnimationFrame(() => {
        setTimeout(() => {
            const navigator = messageElement.find('.swipe-unlock-navigation');
            if (navigator.length === 0) {
                console.log('ScrollToNavigator: Navigator not found');
                return;
            }
            
            const navigatorElement = navigator[0];
            
            // Use scrollIntoView with block: 'end' to position the navigator at the bottom
            navigatorElement.scrollIntoView({
                behavior: 'smooth',
                block: 'end',
                inline: 'nearest'
            });
            
            console.log('ScrollToNavigator: Scrolled to navigator');
        }, 300); // Increased delay to ensure message content is fully updated
    });
}

/**
 * Toggle translation display
 */
function toggleTranslation() {
    showTranslation = !showTranslation;
    
    // Update toggle button appearance
    const toggleButton = $('.swipe-unlock-translation-toggle');
    if (showTranslation) {
        toggleButton.addClass('active');
        toggleButton.attr('title', 'Show original');
    } else {
        toggleButton.removeClass('active');
        toggleButton.attr('title', 'Show translation');
    }
    
    // Update current message display
    if (unlockedMessageId !== -1) {
        const messageElement = $(`#chat .mes[mesid="${unlockedMessageId}"]`);
        const chatArray = getChatArray();
        const message = chatArray[unlockedMessageId];
        if (message) {
            updateMessageDisplay(messageElement, unlockedMessageId, message.swipe_id || 0);
            // Auto-scroll after translation toggle
            scrollToNavigator(messageElement);
        }
    }
}

/**
 * Update message display with new swipe content
 */
async function updateMessageDisplay(messageElement, messageId, swipeId) {
    const chatArray = getChatArray();
    const message = chatArray[messageId];
    if (!message) return;
    
    const swipeContent = message.swipes[swipeId];
    let displayContent = swipeContent;
    
    // Get translation if toggle is on
    if (showTranslation) {
        const translation = await getSwipeTranslation(messageId, swipeId);
        if (translation) {
            displayContent = translation;
        }
    }
    
    // Update message text
    const mesText = messageElement.find('.mes_text');
    if (mesText.length && displayContent) {
        try {
            // Try to use SillyTavern's messageFormatting function
            const formattedContent = messageFormatting(
                displayContent,
                message.name,
                message.is_system || false,
                message.is_user || false,
                messageId
            );
            mesText.html(formattedContent);
        } catch (error) {
            console.warn('Failed to use messageFormatting, using fallback:', error);
            // Fallback: simple HTML escaping and basic formatting
            const escapedContent = $('<div>').text(displayContent).html();
            mesText.html(escapedContent);
        }
    }
}

/**
 * Handle chat changes (new messages, etc.)
 */
function handleChatChange() {
    // Lock any unlocked message when chat changes
    if (unlockedMessageId !== -1) {
        const messageElement = $(`#chat .mes[mesid="${unlockedMessageId}"]`);
        if (messageElement.length) {
            lockMessage(unlockedMessageId, messageElement);
        }
    }
    
    // Add icons to new messages
    setTimeout(() => {
        addLockIconsToMessages();
    }, 100);
}

// Initialize when jQuery is ready
jQuery(() => {
    initializeSwipeUnlock();
});