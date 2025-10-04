import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, remove, serverTimestamp, query, orderByChild, update, get, equalTo } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

async function initializeAppWithConfig() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Could not fetch Firebase config');
        
        const firebaseConfig = await response.json();
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getDatabase(app);

        const messageInput = document.getElementById('message');
        const chatMessagesContainer = document.getElementById('chat-messages');
        const headerAvatar = document.getElementById('header-avatar');
        const headerAvatarWrapper = document.getElementById('header-avatar-wrapper');
        const loader = document.getElementById('loader');
        const profileBtn = document.getElementById('profile-btn');
        const banModal = document.getElementById('ban-modal');
        const banUsernameEl = document.getElementById('ban-username');
        const toastNotification = document.getElementById('toast-notification');
        const cancelReplyBtn = document.getElementById('cancel-reply-btn');
        const submitBtn = document.getElementById('submit-btn');
        const noCommentsPlaceholder = document.getElementById('no-comments-placeholder');
        const imageUploadInput = document.getElementById('image-upload-input');
        const imagePreviewContainer = document.getElementById('image-preview-container');
        const imageViewer = document.getElementById('image-viewer');
        const imageViewerImg = imageViewer.querySelector('img');
        const uploadOverlay = document.getElementById('upload-overlay');
        const chatFormWrapper = document.getElementById('chat-form-wrapper');
        const statusModal = document.getElementById('status-modal');
        const statusModalTitle = document.getElementById('status-modal-title');
        const statusModalText = document.getElementById('status-modal-text');
        const statusModalOk = document.getElementById('status-modal-ok');
        const profileModal = document.getElementById('profile-modal');
        const modalPfpDisplay = document.getElementById('modal-pfp-display');
        const updateUsernameInput = document.getElementById('update-username');
        const updatePfpInput = document.getElementById('update-pfp');
        const logoutBtn = profileModal.querySelector('#logout-btn');
        const bannedUsersSection = document.getElementById('banned-users-section');
        const bannedUsersList = document.getElementById('banned-users-list');

        let currentUser = null;
        let currentUserProfile = null;
        let replyState = { parentId: null };
        let expandedThreads = new Set();
        let allMessagesCache = {};
        let allUsersCache = {};
        let usersLoaded = false;
        let messagesLoaded = false;
        let pinnedCommentId = null;
        let profileHasChanges = false;
        let filesToUpload = [];
        let fullPfpUrl = '';

        function showToast(message) {
            toastNotification.textContent = message;
            toastNotification.classList.add('show');
            setTimeout(() => { toastNotification.classList.remove('show'); }, 3000);
        }

        function getAvatarUrl(userProfile, fallbackName = 'U') {
            return userProfile?.profilePictureUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile?.username || fallbackName)}&background=1a1a1a&color=f0f0f0&bold=true`;
        }

        function formatTimestamp(ts) {
            if (!ts) return '';
            const date = new Date(ts);
            const now = new Date();
            const seconds = Math.floor((now - date) / 1000);
            if (seconds < 60) return "just now";
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes}m`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours}h`;
            const days = Math.floor(hours / 24);
            if (days <= 7) return `${days}d`;
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }

        function escapeHTML(str) {
            return str ? str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])) : '';
        }

        function displayTruncatedUrl(url) {
            if (!url) return '';
            try {
                const urlObj = new URL(url);
                return `${urlObj.protocol}//${urlObj.hostname}/`;
            } catch (e) {
                return url.substring(0, url.lastIndexOf('/') + 1);
            }
        }

        function createMessageHTML(msg) {
            const { userId, timestamp, id, parentId } = msg;
            const isOwner = currentUser?.uid === userId;
            const profile = isOwner ? currentUserProfile : (allUsersCache[userId] || {});
            const username = profile?.username || 'Unknown User';
            const isCurrentUserAdmin = currentUserProfile?.role === 'admin' || currentUserProfile?.role === 'superadmin';
            const isTargetAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';
            const isTargetSuperAdmin = profile?.role === 'superadmin';
            const canAdminAct = !isOwner && (isCurrentUserAdmin || (isCurrentUserAdmin && !isTargetSuperAdmin));
            const adminClass = isTargetAdmin ? 'admin-user' : '';
            const adminBadge = isTargetAdmin ? '<i class="fas fa-crown admin-badge"></i>' : '';
            const isPinned = msg.id === pinnedCommentId;
            const pinBadge = isPinned ? '<span class="pin-badge"><i class="fas fa-thumbtack"></i> Pinned</span>' : '';

            let mentionHTML = '';
            const parentMessage = allMessagesCache[parentId];
            if (parentMessage && parentMessage.parentId) {
                const parentProfile = allUsersCache[parentMessage.userId] || {};
                const parentUsername = parentProfile.username || 'user';
                mentionHTML = `<span class="mention-arrow">&gt;</span> <span class="mention-username">${escapeHTML(parentUsername)}</span>`;
            }
            const escapedUsername = escapeHTML(username);

            let menuOptions = '';
            if(isCurrentUserAdmin && !msg.parentId) {
                menuOptions += `<button class="pin-btn"><i class="fas fa-thumbtack"></i> ${isPinned ? 'Unpin' : 'Pin'} Comment</button>`;
            }
            if(isOwner) {
                menuOptions += '<button class="delete-btn"><i class="fas fa-trash"></i> Delete Comment</button>';
            }
            if(canAdminAct) {
                menuOptions += `<button class="admin-delete-btn"><i class="fas fa-trash-alt"></i> Delete Comment</button>`;
                menuOptions += `<button class="admin-ban-btn"><i class="fas fa-user-slash"></i> Ban User</button>`;
            }

            let bodyHTML = '';
            if (msg.message) {
                bodyHTML += `<p class="message-text">${escapeHTML(msg.message)}</p>`;
            }
            if (msg.imageUrls && msg.imageUrls.length > 0) {
                bodyHTML += '<div class="comment-images">';
                msg.imageUrls.forEach(url => { bodyHTML += `<img src="${url}" class="comment-image">`; });
                bodyHTML += '</div>';
            }

            return `
                <div class="comment-thread" data-id="${id}" data-username="${escapedUsername}" data-user-id="${userId}">
                    <img class="avatar" src="${getAvatarUrl(profile, username)}" alt="${escapedUsername}">
                    <div class="comment-content ${adminClass}">
                        <div class="comment-header">
                            <span class="username">${escapedUsername}</span>${adminBadge}${pinBadge}${mentionHTML}
                        </div>
                        <div class="comment-body">${bodyHTML}</div>
                        <div class="comment-footer">
                            <span class="timestamp">${formatTimestamp(timestamp)}</span>
                            <button class="action-btn reply-btn">Reply</button>
                        </div>
                        ${menuOptions ? `<div class="message-menu"><button class="menu-btn"><i class="fas fa-ellipsis-v"></i></button><div class="menu-popup">${menuOptions}</div></div>` : ''}
                    </div>
                </div>`;
        }

        function buildAndRenderHTML() {
            if (!usersLoaded || !messagesLoaded) return;
            
            const messages = Object.values(allMessagesCache);

            if (messages.length === 0) {
                noCommentsPlaceholder.style.display = 'block';
                chatMessagesContainer.style.display = 'none';
                loader.style.display = 'none';
                return;
            } else {
                noCommentsPlaceholder.style.display = 'none';
                chatMessagesContainer.style.display = 'flex';
            }
            
            const threads = {};
            messages.forEach(msg => {
                if (msg && msg.parentId) {
                    if (!threads[msg.parentId]) threads[msg.parentId] = [];
                    threads[msg.parentId].push(msg);
                }
            });
            Object.values(threads).forEach(list => list.sort((a, b) => a.timestamp - b.timestamp));
            
            const countAllReplies = (parentId) => {
                let count = 0;
                const directReplies = threads[parentId];
                if (directReplies) {
                    count += directReplies.length;
                    directReplies.forEach(reply => { count += countAllReplies(reply.id); });
                }
                return count;
            };
            
            const appendRepliesRecursive = (parentId) => {
                let repliesHTML = '';
                (threads[parentId] || []).forEach(reply => {
                    repliesHTML += createMessageHTML(reply);
                    repliesHTML += appendRepliesRecursive(reply.id);
                });
                return repliesHTML;
            };

            let pinnedHTML = '';
            if (pinnedCommentId && allMessagesCache[pinnedCommentId]) {
                const pinnedMsg = allMessagesCache[pinnedCommentId];
                const totalReplies = countAllReplies(pinnedMsg.id);
                const footerBtns = [ totalReplies > 0 ? `<button class="action-btn toggle-replies-btn">View ${totalReplies} replies</button>` : '', '<button class="action-btn reply-btn">Reply</button>' ].join('');
                const mainCommentHTML = createMessageHTML(pinnedMsg).replace('<button class="action-btn reply-btn">Reply</button>', footerBtns);
                const repliesHTML = appendRepliesRecursive(pinnedMsg.id);
                
                pinnedHTML = `
                    <div class="pinned-comment-wrapper">
                        <div class="comment-thread-wrapper" data-main-id="${pinnedMsg.id}">
                            ${mainCommentHTML}
                            <div class="replies-container">${repliesHTML}</div>
                        </div>
                    </div>`;
            }

            let normalThreadsHTML = '';
            const topLevel = messages.filter(m => m && !m.parentId && m.id !== pinnedCommentId).sort((a, b) => b.timestamp - a.timestamp);

            topLevel.forEach(msg => {
                const totalReplies = countAllReplies(msg.id);
                const footerBtns = [ totalReplies > 0 ? `<button class="action-btn toggle-replies-btn">View ${totalReplies} replies</button>` : '', '<button class="action-btn reply-btn">Reply</button>' ].join('');
                const mainCommentHTML = createMessageHTML(msg).replace('<button class="action-btn reply-btn">Reply</button>', footerBtns);
                const repliesHTML = appendRepliesRecursive(msg.id);
                normalThreadsHTML += `<div class="comment-thread-wrapper" data-main-id="${msg.id}">${mainCommentHTML}<div class="replies-container">${repliesHTML}</div></div>`;
            });

            chatMessagesContainer.innerHTML = pinnedHTML + normalThreadsHTML;
            loader.style.display = 'none';
            chatMessagesContainer.style.visibility = 'visible';
            
            expandedThreads.forEach(id => {
                const wrapper = document.querySelector(`.comment-thread-wrapper[data-main-id="${id}"]`);
                if (wrapper) {
                    const toggleBtn = wrapper.querySelector('.toggle-replies-btn');
                    wrapper.classList.add('is-expanded');
                    if (toggleBtn) toggleBtn.textContent = toggleBtn.textContent.replace('View', 'Hide');
                }
            });
        }

        async function checkBanStatus(user) {
            const banRef = ref(db, `bannedUsers/${user.uid}`);
            const banSnapshot = await get(banRef);

            if (banSnapshot.exists()) {
                const banData = banSnapshot.val();
                if (banData.bannedUntil > Date.now()) {
                    const expiryDate = new Date(banData.bannedUntil).toLocaleString();
                    statusModalTitle.textContent = 'Account Suspended';
                    statusModalText.textContent = `Your account is suspended until ${expiryDate}. You cannot post or comment.`;
                    statusModal.classList.add('visible');
                    chatFormWrapper.style.display = 'none';
                } else {
                    statusModalTitle.textContent = 'Suspension Lifted';
                    statusModalText.textContent = 'Your account suspension has ended. Please follow the community guidelines.';
                    statusModal.classList.add('visible');
                    await remove(banRef);
                }
            }
        }

        function listenForRealtimeUpdates() {
            onValue(ref(db, 'pinnedComment'), (snapshot) => {
                pinnedCommentId = snapshot.val();
                buildAndRenderHTML();
            });

            onValue(ref(db, 'users'), (snapshot) => {
                allUsersCache = snapshot.val() || {};
                usersLoaded = true;
                if (currentUser) currentUserProfile = allUsersCache[currentUser.uid] || currentUserProfile;
                buildAndRenderHTML();
            });

            const messagesQuery = query(ref(db, 'comments'), orderByChild('timestamp'));
            onValue(messagesQuery, (snapshot) => {
                allMessagesCache = snapshot.val() || {};
                messagesLoaded = true;
                buildAndRenderHTML();
            });
        }

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                currentUser = user;
                const userRef = ref(db, `users/${user.uid}`);
                const snapshot = await get(userRef);
                if (snapshot.exists()) {
                    currentUserProfile = snapshot.val();
                } else {
                    const newProfile = { role: 'user', username: user.displayName || `user${user.uid.substring(0, 5)}`, profilePictureUrl: '' };
                    await set(userRef, newProfile);
                    currentUserProfile = newProfile;
                }
                headerAvatar.src = getAvatarUrl(currentUserProfile);
                headerAvatar.onload = () => {
                    headerAvatarWrapper.classList.add('loaded');
                    headerAvatar.classList.add('loaded');
                };
                await checkBanStatus(user);
                listenForRealtimeUpdates();
            } else {
                window.location.href = 'sign.html';
            }
        });

        async function uploadFileAndStoreUrl(fileObject, previewWrapper) {
            try {
                const uniqueFileName = `${Date.now()}-${fileObject.file.name.replace(/\s+/g, '_')}`;
                const getUrlResponse = await fetch("https://pxpic.com/getSignedUrl", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ folder: "uploads", fileName: uniqueFileName })
                });
                if (!getUrlResponse.ok) throw new Error('Failed to get signed URL.');
                const data = await getUrlResponse.json();
                const uploadResponse = await fetch(data.presignedUrl, {
                    method: "PUT", headers: { "Content-Type": fileObject.file.type }, body: fileObject.file
                });
                if (!uploadResponse.ok) throw new Error('File upload failed.');
                
                fileObject.status = 'uploaded';
                fileObject.url = "https://files.fotoenhancer.com/uploads/" + uniqueFileName;
                previewWrapper.classList.remove('uploading');
            } catch(error) {
                fileObject.status = 'failed';
                previewWrapper.classList.remove('uploading');
                previewWrapper.style.border = '2px solid var(--red-color)';
                showToast('Image upload failed.');
                console.error('Upload failed:', error);
            }
        }

        function resetFormUI() {
            replyState = { parentId: null };
            messageInput.placeholder = 'Join the discussion...';
            messageInput.value = '';
            messageInput.style.height = 'auto';
            submitBtn.style.display = 'flex';
            cancelReplyBtn.style.display = 'none';
            imagePreviewContainer.innerHTML = '';
            filesToUpload = [];
            imageUploadInput.value = '';
        }

        document.getElementById('chat-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = messageInput.value.trim();
            if (!message && filesToUpload.length === 0) return;
            
            const isUploading = filesToUpload.some(f => f.status === 'uploading');
            if (isUploading) {
                showToast('Please wait for images to finish uploading.');
                return;
            }

            submitBtn.disabled = true;
            const uploadedImageUrls = filesToUpload.filter(f => f.status === 'uploaded').map(f => f.url);

            const newMessageRef = push(ref(db, 'comments'));
            const messageData = {
                id: newMessageRef.key, userId: currentUser.uid, timestamp: serverTimestamp(),
                parentId: replyState.parentId || null
            };
            if (message) messageData.message = message;
            if (uploadedImageUrls.length > 0) messageData.imageUrls = uploadedImageUrls;

            set(newMessageRef, messageData).catch(error => showToast("Failed to send message: " + error.message));
            
            if(replyState.parentId) {
               const parentMsg = Object.values(allMessagesCache).find(m => m.id === replyState.parentId);
               const mainParentId = parentMsg?.parentId || replyState.parentId;
               expandedThreads.add(mainParentId);
            }
            resetFormUI();
            submitBtn.disabled = false;
        });

        chatMessagesContainer.addEventListener('click', (e) => {
            const { target } = e;
            const thread = target.closest('.comment-thread');
            if (!thread) return;
            const messageId = thread.dataset.id;
            
            if (target.closest('.menu-btn')) {
                document.querySelectorAll('.menu-popup').forEach(p => p.style.display = 'none');
                const popup = thread.querySelector('.menu-popup');
                popup.style.display = 'block';
            } else if (target.matches('.pin-btn')) {
                const isAlreadyPinned = messageId === pinnedCommentId;
                set(ref(db, 'pinnedComment'), isAlreadyPinned ? null : messageId);
            } else if (target.matches('.delete-btn, .admin-delete-btn')) {
                const idsToDelete = new Set();
                function findRepliesRecursive(pId) {
                    idsToDelete.add(pId);
                    Object.values(allMessagesCache).forEach(msg => { if (msg && msg.parentId === pId) findRepliesRecursive(msg.id); });
                }
                findRepliesRecursive(messageId);
                idsToDelete.forEach(id => { remove(ref(db, `comments/${id}`)); expandedThreads.delete(id); });
                if(idsToDelete.has(pinnedCommentId)) remove(ref(db, 'pinnedComment'));
            } else if (target.matches('.admin-ban-btn')) {
                banUsernameEl.textContent = thread.dataset.username;
                banModal.dataset.userId = thread.dataset.userId;
                banModal.classList.add('visible');
            } else if (target.matches('.reply-btn')) {
                replyState = { parentId: messageId };
                messageInput.placeholder = `Replying to @${thread.dataset.username}...`;
                cancelReplyBtn.style.display = 'flex';
                submitBtn.style.display = 'none';
                messageInput.focus();
            } else if (target.matches('.toggle-replies-btn')) {
                const mainWrapper = target.closest('.comment-thread-wrapper');
                const mainId = mainWrapper.dataset.mainId;
                const isVisible = mainWrapper.classList.contains('is-expanded');
                mainWrapper.classList.toggle('is-expanded', !isVisible);
                target.textContent = isVisible ? target.textContent.replace('Hide', 'View') : target.textContent.replace('View', 'Hide');
                if (!isVisible) expandedThreads.add(mainId);
                else expandedThreads.delete(mainId);
            } else if (target.matches('.comment-image')) {
                imageViewerImg.src = target.src;
                imageViewer.classList.add('visible');
            }
        });

        cancelReplyBtn.addEventListener('click', () => {
            replyState = { parentId: null };
            messageInput.placeholder = 'Join the discussion...';
            cancelReplyBtn.style.display = 'none';
            submitBtn.style.display = 'flex';
        });

        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = `${this.scrollHeight}px`;
            if (replyState.parentId) {
                const hasText = this.value.trim().length > 0;
                submitBtn.style.display = hasText ? 'flex' : 'none';
                cancelReplyBtn.style.display = hasText ? 'none' : 'flex';
            }
        });

        imageUploadInput.addEventListener('change', () => {
            if (imageUploadInput.files.length + filesToUpload.length > 2) {
                showToast('You can only upload a maximum of 2 images.');
                return;
            }
            for (const file of imageUploadInput.files) {
                const fileObject = { file, status: 'uploading', url: null };
                filesToUpload.push(fileObject);
                const reader = new FileReader();
                reader.onload = (e) => {
                    const previewWrapper = document.createElement('div');
                    previewWrapper.className = 'img-preview uploading';
                    previewWrapper.innerHTML = `<img src="${e.target.result}"><button class="remove-img-btn">&times;</button>`;
                    previewWrapper.querySelector('.remove-img-btn').onclick = () => {
                        const index = filesToUpload.indexOf(fileObject);
                        if (index > -1) filesToUpload.splice(index, 1);
                        previewWrapper.remove();
                    };
                    imagePreviewContainer.appendChild(previewWrapper);
                    uploadFileAndStoreUrl(fileObject, previewWrapper);
                };
                reader.readAsDataURL(file);
            }
        });

        async function renderBannedUsers() {
            bannedUsersList.innerHTML = `<div class="spinner"></div>`;
            const snapshot = await get(ref(db, 'bannedUsers'));
            if (snapshot.exists()) {
                const banned = snapshot.val();
                let html = '';
                Object.keys(banned).forEach(uid => {
                    const username = allUsersCache[uid]?.username || 'Unknown User';
                    html += `
                        <div class="banned-user-item">
                            <span>${escapeHTML(username)}</span>
                            <button class="unban-btn" data-uid="${uid}">Unban</button>
                        </div>`;
                });
                bannedUsersList.innerHTML = html;
            } else {
                bannedUsersList.innerHTML = '<p>No users are currently banned.</p>';
            }
        }
        
        profileBtn.addEventListener('click', () => {
            modalPfpDisplay.src = getAvatarUrl(currentUserProfile);
            fullPfpUrl = currentUserProfile.profilePictureUrl || '';
            updateUsernameInput.value = currentUserProfile.username;
            updatePfpInput.value = displayTruncatedUrl(fullPfpUrl);
            
            if (currentUserProfile.role === 'admin' || currentUserProfile.role === 'superadmin') {
                bannedUsersSection.style.display = 'block';
                renderBannedUsers();
            } else {
                bannedUsersSection.style.display = 'none';
            }
            
            profileModal.classList.add('visible');
        });

        profileModal.querySelector('.modal-close-btn').addEventListener('click', () => {
            profileModal.classList.remove('visible');
            if (profileHasChanges) {
                location.reload();
            }
        });

        updatePfpInput.addEventListener('focus', () => {
            if(updatePfpInput.value !== fullPfpUrl) updatePfpInput.value = fullPfpUrl;
        });

        updatePfpInput.addEventListener('blur', () => {
            fullPfpUrl = updatePfpInput.value;
            updatePfpInput.value = displayTruncatedUrl(fullPfpUrl);
            saveProfileChanges();
        });

        logoutBtn.addEventListener('click', () => signOut(auth));

        async function saveProfileChanges() {
            const newUsername = updateUsernameInput.value.trim();
            const newPfp = fullPfpUrl.trim();
            let hasChanges = false;
            if (newUsername && newUsername !== currentUserProfile.username) hasChanges = true;
            if (newPfp !== (currentUserProfile.profilePictureUrl || '')) hasChanges = true;

            if (hasChanges) {
                const updates = {};
                updates[`users/${currentUser.uid}/username`] = newUsername;
                updates[`users/${currentUser.uid}/profilePictureUrl`] = newPfp;
                await update(ref(db), updates);
                await updateProfile(currentUser, { displayName: newUsername });
                profileHasChanges = true;
                showToast('Profile will update on next reload.');
            }
        }

        updateUsernameInput.addEventListener('blur', saveProfileChanges);
        updateUsernameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
        updatePfpInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
        
        bannedUsersList.addEventListener('click', async (e) => {
            if (e.target.classList.contains('unban-btn')) {
                const uidToUnban = e.target.dataset.uid;
                await remove(ref(db, `bannedUsers/${uidToUnban}`));
                showToast('User has been unbanned.');
                renderBannedUsers();
            }
        });

        banModal.addEventListener('click', async (e) => {
            if (e.target.matches('.modal-close-btn')) { banModal.classList.remove('visible'); return; }
            if (e.target.matches('.ban-options button')) {
                const userIdToBan = banModal.dataset.userId;
                const durationHours = parseFloat(e.target.dataset.hours);
                const banUntil = durationHours === 0 ? 9999999999999 : Date.now() + durationHours * 3600000;
                try {
                    await set(ref(db, `bannedUsers/${userIdToBan}`), {
                        bannedBy: currentUser.uid, bannedUntil: banUntil, timestamp: serverTimestamp()
                    });
                    const commentsQuery = query(ref(db, 'comments'), orderByChild('userId'), equalTo(userIdToBan));
                    const commentsSnapshot = await get(commentsQuery);
                    if (commentsSnapshot.exists()) {
                        const updates = {};
                        commentsSnapshot.forEach(child => { updates[child.key] = null; });
                        await update(ref(db, 'comments'), updates);
                    }
                    showToast('User has been banned and their comments deleted.');
                } catch(err) { showToast('Error: ' + err.message); } finally { banModal.classList.remove('visible'); }
            }
        });

        imageViewer.addEventListener('click', (e) => {
            if (e.target === imageViewer || e.target.matches('.modal-close-btn')) {
                imageViewer.classList.remove('visible');
            }
        });

        statusModalOk.addEventListener('click', () => statusModal.classList.remove('visible'));

        document.addEventListener('click', e => {
            if (!e.target.closest('.message-menu')) {
                document.querySelectorAll('.menu-popup').forEach(p => p.style.display = 'none');
            }
        });

    } catch (error) {
        console.error("Failed to initialize app:", error);
        document.body.innerHTML = '<h1>Error: Could not load application configuration. Please refresh the page.</h1>';
    }
}

initializeAppWithConfig();