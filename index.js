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

// State management - support multiple unlocked messages
const unlockedMessages = new Map(); // Map<messageId, {originalSwipeId, showTranslation}>

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
    <div class="mes_button swipe-unlock-icon interactable" title="Unlock swipe navigation" tabindex="0">
        <i class="fa-solid fa-lock"></i>
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
        
        toggleMessageLock(messageId, messageElement);
    });
    
    // Custom swipe button handlers for unlocked messages
    $(document).on('click', '.swipe-unlock-left', function(event) {
        event.preventDefault();
        event.stopPropagation();
        const messageElement = $(this).closest('.mes');
        const messageId = parseInt(messageElement.attr('mesid'));
        swipeUnlockedMessage(messageId, -1);
    });
    
    $(document).on('click', '.swipe-unlock-right', function(event) {
        event.preventDefault();
        event.stopPropagation();
        const messageElement = $(this).closest('.mes');
        const messageId = parseInt(messageElement.attr('mesid'));
        swipeUnlockedMessage(messageId, 1);
    });
    
    // Translation toggle handler
    $(document).on('click', '.swipe-unlock-translation-toggle', function(event) {
        event.preventDefault();
        event.stopPropagation();
        const messageElement = $(this).closest('.mes');
        const messageId = parseInt(messageElement.attr('mesid'));
        toggleTranslation(messageId);
    });
    
    // Copy button handler
    $(document).on('click', '.swipe-unlock-copy', function(event) {
        event.preventDefault();
        event.stopPropagation();
        const messageElement = $(this).closest('.mes');
        const messageId = parseInt(messageElement.attr('mesid'));
        copyMessageText(messageId);
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
    if (unlockedMessages.has(messageId)) {
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
    
    // Store original state for this message
    unlockedMessages.set(messageId, {
        originalSwipeId: message.swipe_id || 0,
        showTranslation: false
    });
    
    // Update icon
    const icon = messageElement.find('.swipe-unlock-icon i');
    icon.removeClass('fa-lock').addClass('fa-lock-open');
    messageElement.find('.swipe-unlock-icon').attr('title', 'Lock swipe navigation');
    
    // Add swipe navigation UI
    addSwipeNavigationToMessage(messageElement, messageId);
    
    // Add unlocked class
    messageElement.addClass('swipe-unlocked');
    
    console.log(`Message #${messageId} unlocked for swipe navigation`);
}

/**
 * Lock a message (remove swipe navigation)
 */
function lockMessage(messageId, messageElement) {
    // Get stored state for this message
    const messageState = unlockedMessages.get(messageId);
    if (!messageState) return;
    
    // Restore original swipe
    const chatArray = getChatArray();
    const message = chatArray[messageId];
    if (message) {
        message.swipe_id = messageState.originalSwipeId;
        updateMessageDisplay(messageElement, messageId, messageState.originalSwipeId, messageState.showTranslation);
    }
    
    // Update icon
    const icon = messageElement.find('.swipe-unlock-icon i');
    icon.removeClass('fa-lock-open').addClass('fa-lock');
    messageElement.find('.swipe-unlock-icon').attr('title', 'Unlock swipe navigation');
    
    // Remove swipe navigation UI
    removeSwipeNavigationFromMessage(messageElement);
    
    // Remove unlocked class
    messageElement.removeClass('swipe-unlocked');
    
    // Remove from unlocked messages
    unlockedMessages.delete(messageId);
    
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
            <div class="swipe-unlock-copy" title="Copy text">
                <i class="fa-solid fa-copy"></i>
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
    highlightOriginalSwipe(messageElement, messageId);
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
    highlightOriginalSwipe(messageElement, messageId);
}

/**
 * Highlight the original swipe number with special color
 */
function highlightOriginalSwipe(messageElement, messageId) {
    const counter = messageElement.find('.swipe-unlock-counter');
    const chatArray = getChatArray();
    const message = chatArray[messageId];
    if (!message) return;
    
    const messageState = unlockedMessages.get(messageId);
    if (!messageState) return;
    
    const currentSwipeId = message.swipe_id || 0;
    
    if (currentSwipeId === messageState.originalSwipeId) {
        counter.addClass('original-swipe');
    } else {
        counter.removeClass('original-swipe');
    }
}

/**
 * Swipe the unlocked message
 */
function swipeUnlockedMessage(messageId, direction) {
    if (!unlockedMessages.has(messageId)) return;
    
    const chatArray = getChatArray();
    const message = chatArray[messageId];
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
    const messageElement = $(`#chat .mes[mesid="${messageId}"]`);
    const messageState = unlockedMessages.get(messageId);
    updateMessageDisplay(messageElement, messageId, newSwipeId, messageState.showTranslation);
    updateSwipeButtonStates(messageElement, messageId);
}

/**
 * Toggle translation display for a specific message
 */
function toggleTranslation(messageId) {
    const messageState = unlockedMessages.get(messageId);
    if (!messageState) return;
    
    messageState.showTranslation = !messageState.showTranslation;
    
    // Update toggle button appearance for this specific message
    const messageElement = $(`#chat .mes[mesid="${messageId}"]`);
    const toggleButton = messageElement.find('.swipe-unlock-translation-toggle');
    if (messageState.showTranslation) {
        toggleButton.addClass('active');
        toggleButton.attr('title', 'Show original');
    } else {
        toggleButton.removeClass('active');
        toggleButton.attr('title', 'Show translation');
    }
    
    // Update message display
    const chatArray = getChatArray();
    const message = chatArray[messageId];
    if (message) {
        updateMessageDisplay(messageElement, messageId, message.swipe_id || 0, messageState.showTranslation);
    }
}

/**
 * Copy message text (original or translation based on current state)
 */
async function copyMessageText(messageId) {
    const messageState = unlockedMessages.get(messageId);
    if (!messageState) return;
    
    const chatArray = getChatArray();
    const message = chatArray[messageId];
    if (!message) return;
    
    const swipeId = message.swipe_id || 0;
    let textToCopy = message.swipes[swipeId];
    
    // If translation is enabled, get translation text
    if (messageState.showTranslation) {
        const translation = await getSwipeTranslation(messageId, swipeId);
        if (translation) {
            textToCopy = translation;
        }
    }
    
    // Remove HTML tags and get plain text
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = textToCopy;
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    
    // Copy to clipboard
    try {
        await navigator.clipboard.writeText(plainText);
        toastr.success('Text copied to clipboard');
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = plainText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            toastr.success('Text copied to clipboard');
        } catch (err) {
            toastr.error('Failed to copy text');
        }
        document.body.removeChild(textArea);
    }
}

/**
 * Update message display with new swipe content
 */
async function updateMessageDisplay(messageElement, messageId, swipeId, showTranslation = false) {
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
    // Add icons to new messages
    setTimeout(() => {
        addLockIconsToMessages();
    }, 100);
    
    // Note: Unlocked messages remain unlocked even when chat changes
    // Users can manually lock them if needed
}

// Initialize when jQuery is ready
jQuery(() => {
    initializeSwipeUnlock();
});