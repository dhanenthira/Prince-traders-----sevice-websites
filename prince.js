
// Firebase configuration
const firebaseConfig = {
    apiKey: window.env.API_KEY,
    authDomain: window.env.AUTH_DOMAIN,
    projectId: window.env.PROJECT_ID,
    storageBucket: window.env.STORAGE_BUCKET,
    messagingSenderId: window.env.MESSAGING_SENDER_ID,
    appId: window.env.APP_ID,
    measurementId: window.env.MEASUREMENT_ID
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const reviewsCollection = db.collection('reviews');
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Mobile menu toggle
const menuToggle = document.getElementById('menu-toggle');
const nav = document.getElementById('nav');
menuToggle.addEventListener('click', () => nav.classList.toggle('active'));

function scrollToSection(id) {
    document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
    nav.classList.remove('active');
}

document.querySelectorAll('#nav a').forEach(link => {
    link.addEventListener('click', () => nav.classList.remove('active'));
});

// Modal functions
const modal = document.getElementById('reviewModal');
const googleDiv = document.getElementById('googleSignInDiv');
const formDiv = document.getElementById('reviewFormDiv');
const userBadge = document.getElementById('userBadge');
const reviewText = document.getElementById('reviewText');
const googleErrorDiv = document.getElementById('googleSignInError');
const googleErrorText = document.getElementById('googleErrorText');

function openReviewModal() {
    modal.style.display = 'flex';
    googleErrorDiv.style.display = 'none';
    const user = auth.currentUser;
    if (user) {
        googleDiv.style.display = 'none';
        formDiv.style.display = 'block';
        // Reset star rating
        document.querySelectorAll('.star-rating input').forEach(r => r.checked = false);
        userBadge.innerHTML = `
                <img src="${user.photoURL || 'https://via.placeholder.com/40/0a8f3d/ffffff?text=User'}" alt="profile">
                <span>${user.displayName || 'User'}</span>
                <i class="fas fa-sign-out-alt" title="Sign out" onclick="signOut()"></i>
            `;
    } else {
        googleDiv.style.display = 'block';
        formDiv.style.display = 'none';
    }
    reviewText.value = '';
}

function closeReviewModal() {
    modal.style.display = 'none';
    googleErrorDiv.style.display = 'none';
}

// Google Sign-In
async function signInWithGoogle() {
    googleErrorDiv.style.display = 'none';
    try {
        await auth.signInWithPopup(googleProvider);
        // After sign-in, close modal if open? We'll keep modal open if it was for review.
        // For reply, we handle separately.
        if (modal.style.display === 'flex') {
            openReviewModal(); // refresh
        }
    } catch (error) {
        console.error('Sign-in error:', error);
        let message = '';
        if (error.code === 'auth/popup-closed-by-user') {
            message = 'Sign-in popup was closed. Please try again.';
        } else if (error.code === 'auth/popup-blocked') {
            message = 'Popup was blocked by your browser. Please allow popups for this site.';
        } else if (error.code === 'auth/cancelled-popup-request') {
            message = 'Another sign-in request is pending. Please wait.';
        } else if (error.code === 'auth/unauthorized-domain') {
            message = 'This domain is not authorized for Google Sign-In. Please add it to your Firebase console.';
        } else if (error.code === 'auth/operation-not-allowed') {
            message = 'Google Sign-In is not enabled in Firebase. Please enable it.';
        } else {
            message = 'Google sign-in failed. Error: ' + error.message;
        }
        googleErrorText.innerText = message;
        googleErrorDiv.style.display = 'flex';
    }
}

async function signOut() {
    try {
        await auth.signOut();
        closeReviewModal();
        loadReviews(); // refresh to remove reply forms
    } catch (error) {
        console.error('Sign-out error:', error);
    }
}

// Format Firestore timestamp
function formatDate(timestamp) {
    if (!timestamp) return 'recent';
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Render star display
function renderStars(rating) {
    const fullStar = '★';
    const emptyStar = '☆';
    return fullStar.repeat(rating) + emptyStar.repeat(5 - rating);
}

// Render a single review card with replies and likes
async function renderReview(doc) {
    const data = doc.data();
    const reviewId = doc.id;
    const user = auth.currentUser;
    const photoHTML = data.photoURL
        ? `<img src="${data.photoURL}" alt="${data.name}">`
        : `<i class="fas fa-user-circle"></i>`;
    const dateStr = data.createdAt ? formatDate(data.createdAt) : 'recent';
    const starDisplay = renderStars(data.rating || 5);
    const likeCount = data.likes ? Object.keys(data.likes).length : 0;
    const userLiked = user && data.likes && data.likes[user.uid] ? true : false;

    // Fetch replies subcollection
    let repliesHtml = '';
    try {
        const repliesSnap = await db.collection('reviews').doc(reviewId).collection('replies').orderBy('createdAt', 'asc').get();
        repliesSnap.forEach(replyDoc => {
            const reply = replyDoc.data();
            const replyPhoto = reply.photoURL ? `<img src="${reply.photoURL}">` : `<i class="fas fa-user-circle"></i>`;
            const replyDate = formatDate(reply.createdAt);
            const replyLikeCount = reply.likes ? Object.keys(reply.likes).length : 0;
            const replyUserLiked = user && reply.likes && reply.likes[user.uid] ? true : false;
            repliesHtml += `
                    <div class="reply-card" data-reply-id="${replyDoc.id}">
                        <div class="reply-header">
                            <div class="reply-pic">${replyPhoto}</div>
                            <div class="reply-info">
                                <h5>${reply.name}</h5>
                                <div class="reply-date">${replyDate}</div>
                            </div>
                        </div>
                        <div class="reply-text">${reply.text}</div>
                        <div class="reply-actions">
                            <span class="reply-like ${replyUserLiked ? 'liked' : ''}" onclick="toggleReplyLike('${reviewId}', '${replyDoc.id}')">
                                <i class="fa${replyUserLiked ? 's' : 'r'} fa-thumbs-up"></i> ${replyLikeCount}
                            </span>
                        </div>
                    </div>
                `;
        });
    } catch (e) {
        console.warn('Error loading replies', e);
    }

    // Reply form or sign-in prompt
    let replyUi;
    if (user) {
        // Signed in: show reply form (initially hidden)
        replyUi = `
                <div class="reply-form" id="reply-form-${reviewId}" style="display: none;">
                    <textarea id="reply-text-${reviewId}" placeholder="Write a reply..."></textarea>
                    <button onclick="postReply('${reviewId}')">Reply</button>
                </div>
            `;
    } else {
        // Not signed in: show a hidden sign-in prompt (will appear when Reply clicked)
        replyUi = `
                <div class="signin-prompt" id="signin-prompt-${reviewId}" style="display: none;">
                    <i class="fas fa-info-circle"></i>
                    <span>Please sign in to reply.</span>
                    <button onclick="signInAndShowReply('${reviewId}')">Sign in</button>
                </div>
            `;
    }

    return `
            <div class="review-card" data-id="${reviewId}">
                <div class="review-header">
                    <div class="profile-pic">${photoHTML}</div>
                    <div class="reviewer-info">
                        <h4>${data.name || 'Anonymous'}</h4>
                        <div class="star-rating-display">${starDisplay}</div>
                        <div class="review-date">${dateStr}</div>
                    </div>
                </div>
                <div class="review-text">"${data.text}"</div>
                <div class="review-actions">
                    <span class="review-like ${userLiked ? 'liked' : ''}" onclick="toggleLike('${reviewId}')">
                        <i class="fa${userLiked ? 's' : 'r'} fa-thumbs-up"></i> ${likeCount}
                    </span>
                    <span onclick="handleReplyClick('${reviewId}')"><i class="far fa-comment"></i> Reply</span>
                </div>
                <div class="reply-section" id="replies-${reviewId}">
                    ${repliesHtml}
                </div>
                ${replyUi}
            </div>
        `;
}

// Handle reply click: show form or sign-in prompt
window.handleReplyClick = function (reviewId) {
    const user = auth.currentUser;
    if (user) {
        // Show reply form
        const form = document.getElementById(`reply-form-${reviewId}`);
        if (form) {
            form.style.display = 'flex';
            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } else {
        // Show sign-in prompt
        const prompt = document.getElementById(`signin-prompt-${reviewId}`);
        if (prompt) {
            prompt.style.display = 'flex';
            prompt.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            // If prompt not found (maybe not rendered), open modal
            openReviewModal();
        }
    }
};

// Sign in and then show reply form for that review
window.signInAndShowReply = async function (reviewId) {
    await signInWithGoogle();
    // After sign-in, user is logged in. We need to refresh the card to show reply form.
    // Instead of full reload, we can manually show the form if the user object exists now.
    if (auth.currentUser) {
        // Hide prompt
        const prompt = document.getElementById(`signin-prompt-${reviewId}`);
        if (prompt) prompt.style.display = 'none';
        // Show form (may need to create it if not present)
        let form = document.getElementById(`reply-form-${reviewId}`);
        if (!form) {
            // If form doesn't exist, reload reviews to get updated UI
            loadReviews();
        } else {
            form.style.display = 'flex';
            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
};

// Toggle like on review
window.toggleLike = async function (reviewId) {
    const user = auth.currentUser;
    if (!user) {
        openReviewModal(); // prompt sign-in
        return;
    }
    const reviewRef = db.collection('reviews').doc(reviewId);
    await db.runTransaction(async (transaction) => {
        const reviewDoc = await transaction.get(reviewRef);
        if (!reviewDoc.exists) return;
        const data = reviewDoc.data();
        const likes = data.likes || {};
        if (likes[user.uid]) {
            delete likes[user.uid];
        } else {
            likes[user.uid] = true;
        }
        transaction.update(reviewRef, { likes });
    });
    loadReviews();
};

// Toggle like on reply
window.toggleReplyLike = async function (reviewId, replyId) {
    const user = auth.currentUser;
    if (!user) {
        openReviewModal();
        return;
    }
    const replyRef = db.collection('reviews').doc(reviewId).collection('replies').doc(replyId);
    await db.runTransaction(async (transaction) => {
        const replyDoc = await transaction.get(replyRef);
        if (!replyDoc.exists) return;
        const data = replyDoc.data();
        const likes = data.likes || {};
        if (likes[user.uid]) {
            delete likes[user.uid];
        } else {
            likes[user.uid] = true;
        }
        transaction.update(replyRef, { likes });
    });
    loadReviews();
};

// Post a reply
window.postReply = async function (reviewId) {
    const user = auth.currentUser;
    if (!user) {
        openReviewModal();
        return;
    }
    const text = document.getElementById(`reply-text-${reviewId}`).value.trim();
    if (!text) return;
    const replyRef = db.collection('reviews').doc(reviewId).collection('replies').doc();
    await replyRef.set({
        uid: user.uid,
        name: user.displayName || 'Anonymous',
        photoURL: user.photoURL || null,
        text: text,
        likes: {},
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Clear form and reload reviews (or we could append dynamically, but reload is simpler)
    document.getElementById(`reply-text-${reviewId}`).value = '';
    loadReviews();
    // Optionally scroll to replies section after reload
    setTimeout(() => {
        const repliesSection = document.getElementById(`replies-${reviewId}`);
        if (repliesSection) {
            repliesSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 500);
};

// Load reviews from Firestore
async function loadReviews() {
    const grid = document.getElementById('reviewsGrid');
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">Loading reviews...</div>';
    try {
        const snapshot = await reviewsCollection.orderBy('createdAt', 'desc').get();
        if (snapshot.empty) {
            grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px;">No reviews yet. Be the first to add one!</div>';
            return;
        }
        let html = '';
        for (const doc of snapshot.docs) {
            html += await renderReview(doc);
        }
        grid.innerHTML = html;
    } catch (error) {
        console.error('Error loading reviews:', error);
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: red;">Failed to load reviews. Please refresh.</div>';
    }
}

// Submit a new review with rating
async function submitReview() {
    const user = auth.currentUser;
    if (!user) {
        alert('You must be signed in.');
        return;
    }
    const text = reviewText.value.trim();
    const ratingInput = document.querySelector('input[name="rating"]:checked');
    const rating = ratingInput ? parseInt(ratingInput.value) : 5;

    if (!text) {
        alert('Please write your review.');
        return;
    }

    const submitBtn = document.querySelector('.btn-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    try {
        await reviewsCollection.add({
            uid: user.uid,
            name: user.displayName || 'Anonymous',
            text: text,
            rating: rating,
            photoURL: user.photoURL || null,
            likes: {},
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        closeReviewModal();
        loadReviews();
    } catch (error) {
        console.error('Error adding review:', error);
        alert('Failed to submit review. Please try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Review';
    }
}

// Auth state change
auth.onAuthStateChanged(user => {
    if (modal.style.display === 'flex') {
        if (user) {
            googleDiv.style.display = 'none';
            formDiv.style.display = 'block';
            userBadge.innerHTML = `
                    <img src="${user.photoURL || 'https://via.placeholder.com/40/0a8f3d/ffffff?text=User'}" alt="profile">
                    <span>${user.displayName || 'User'}</span>
                    <i class="fas fa-sign-out-alt" title="Sign out" onclick="signOut()"></i>
                `;
        } else {
            googleDiv.style.display = 'block';
            formDiv.style.display = 'none';
        }
    }
    // Also refresh reviews to update reply buttons visibility
    loadReviews();
});

window.addEventListener('DOMContentLoaded', loadReviews);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.style.display === 'flex') closeReviewModal(); });

