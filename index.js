/**
 * Swipe Unlock Extension for SillyTavern
 * Allows unlocking swipe navigation for historical messages
 */
import { getContext } from '../../../extensions.js';

const pluginName = 'swipe-unlock';

// State management
let unlockedMessageId = -1; // Currently unlocked message ID
let originalSwipeId = -1; // Original swipe ID before unlock

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
    
    // Override swipe functions to check for conflicts
    overrideSwipeFunctions();
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
    const context = getContext();
    const message = context?.chat?.[messageId];
    
    // Debug logging
    console.log('=== Swipe Unlock Debug ===');
    console.log('MessageId:', messageId);
    console.log('Context exists:', !!context);
    console.log('Chat length:', context?.chat?.length);
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
    // Restore original swipe
    const context = getContext();
    const message = context?.chat?.[messageId];
    if (message) {
        message.swipe_id = originalSwipeId;
        updateMessageDisplay(messageElement, messageId, originalSwipeId);
    }
    
    // Update icon
    const icon = messageElement.find('.swipe-unlock-icon i');
    icon.removeClass('fa-lock-open').addClass('fa-lock');
    messageElement.find('.swipe-unlock-icon').attr('title', 'Unlock swipe navigation');
    
    // Remove swipe navigation UI
    removeSwipeNavigationFromMessage(messageElement);
    
    // Remove unlocked class
    messageElement.removeClass('swipe-unlocked');
    
    // Reset state
    unlockedMessageId = -1;
    originalSwipeId = -1;
    
    console.log(`Message #${messageId} locked`);
}

/**
 * Add swipe navigation UI to a message
 */
function addSwipeNavigationToMessage(messageElement, messageId) {
    const context = getContext();
    const message = context?.chat?.[messageId];
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
    const context = getContext();
    const message = context?.chat?.[messageId];
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
    const context = getContext();
    const message = context?.chat?.[unlockedMessageId];
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
    
    const context = getContext();
    const message = context?.chat?.[unlockedMessageId];
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
}

/**
 * Update message display with new swipe content
 */
function updateMessageDisplay(messageElement, messageId, swipeId) {
    const context = getContext();
    const message = context?.chat?.[messageId];
    if (!message) return;
    
    const swipeContent = message.swipes[swipeId];
    
    // Update message text
    const mesText = messageElement.find('.mes_text');
    if (mesText.length) {
        mesText.html(messageFormatting(
            swipeContent,
            message.name,
            message.is_system,
            message.is_user
        ));
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

/**
 * Override swipe functions to prevent conflicts
 */
function overrideSwipeFunctions() {
    // Store original functions
    const originalSwipeRight = window.swipe_right;
    const originalSwipeLeft = window.swipe_left;
    
    // Override swipe_right
    window.swipe_right = function() {
        if (unlockedMessageId !== -1) {
            toastr.warning(`Please lock message #${unlockedMessageId} before swiping the last message.`);
            return;
        }
        return originalSwipeRight.apply(this, arguments);
    };
    
    // Override swipe_left
    window.swipe_left = function() {
        if (unlockedMessageId !== -1) {
            toastr.warning(`Please lock message #${unlockedMessageId} before swiping the last message.`);
            return;
        }
        return originalSwipeLeft.apply(this, arguments);
    };
    
    // Override message sending
    const originalSendSystemMessage = window.sendSystemMessage;
    if (originalSendSystemMessage) {
        window.sendSystemMessage = function() {
            if (unlockedMessageId !== -1) {
                toastr.warning(`Please lock message #${unlockedMessageId} before sending a new message.`);
                return;
            }
            return originalSendSystemMessage.apply(this, arguments);
        };
    }
    
    // Override Generate function
    const originalGenerate = window.Generate;
    if (originalGenerate) {
        window.Generate = function() {
            if (unlockedMessageId !== -1) {
                toastr.warning(`Please lock message #${unlockedMessageId} before generating a new response.`);
                return;
            }
            return originalGenerate.apply(this, arguments);
        };
    }
}

// Initialize when jQuery is ready
jQuery(() => {
    initializeSwipeUnlock();
});