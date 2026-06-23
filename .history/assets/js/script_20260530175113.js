/**
 * 3DRIP | LUXURY STREETWEAR 2026
 * MAIN SCRIPT (assets copy) - adjusted config import path
 */

import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  getDocFromServer,
  setDoc,
  getDoc,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase
console.log("[SYSTEM] INITIALIZING FIREBASE MAINFRAME...");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const auth = getAuth(app);
console.log("[SYSTEM] FIREBASE CORE ONLINE.");

// Connectivity Test
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

document.addEventListener("DOMContentLoaded", () => {
  // Operation Types for error handling
  const OperationType = {
    CREATE: "create",
    UPDATE: "update",
    DELETE: "delete",
    LIST: "list",
    GET: "get",
    WRITE: "write",
  };

  const showToast = (msg, actionText, onAction) => {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
            <i class="fa-solid fa-bell" style="color: var(--accent);"></i>
            <span class="toast-msg">${msg}</span>
            ${actionText ? `<button class="undo-btn">${actionText}</button>` : ""}
        `;

    if (onAction) {
      toast.querySelector(".undo-btn").addEventListener("click", () => {
        onAction();
        toast.classList.add("fade-out");
        setTimeout(() => toast.remove(), 400);
      });
    }

    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("fade-out");
      setTimeout(() => toast.remove(), 400);
    }, 6000); // 6s duration
  };

  function handleFirestoreError(error, operationType, path) {
    const errInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
      },
      operationType,
      path,
    };
    console.error("Firestore Error: ", JSON.stringify(errInfo));
    showToast(`ERROR: ${error.message || "PERMISSION DENIED"}`);
  }

  // Current state held in memory (synced with Firestore)
  let state = {
    products: [],
    orders: [],
    logs: [],
    trash: [],
    reviews: [],
    categories: [],
  };

  // Tracking active Firestore listeners for clean re-init
  const activeListeners = {
    products: null,
    orders: null,
    logs: null,
    trash: null,
    reviews: null,
    categories: null,
  };

  // Replace DB helper with Firestore logic
  const DB = {
    // Now mostly reactive listeners, but we keep the structure for compatibility
    saveOrder: async (orderData) => {
      try {
        console.log("[ORDER_SAVE_START]", orderData);

        const docRef = await addDoc(collection(db, "orders"), {
          ...orderData,
          createdAt: new Date().toISOString(),
        });

        console.log("[ORDER_SAVE_SUCCESS]", docRef.id);

        return docRef.id;
      } catch (error) {
        console.error("[ORDER_SAVE_ERROR]", error);
        throw error;
      }
    },
    addProduct: async (productData) => {
      if (!productData || !productData.img || productData.img.trim() === "") {
        throw new Error("SERVER REJECTION: IMAGE SOURCE REQUIRED.");
      }
      await addDoc(collection(db, "products"), {
        ...productData,
        createdAt: new Date().toISOString(),
      });
    },
    updateProduct: async (id, productData) => {
      if (!productData || !productData.img || productData.img.trim() === "") {
        throw new Error("SERVER REJECTION: IMAGE SOURCE REQUIRED.");
      }
      await updateDoc(doc(db, "products", id), productData);
    },
    deleteToTrash: async (product) => {
      try {
        const { id, ...productData } = product;
        // Move to trash collection first
        await addDoc(collection(db, "trash"), {
          ...productData,
          deletedAt: new Date().toISOString(),
        });
        // Then delete from products
        await deleteDoc(doc(db, "products", id));
        // Log action
        await DB.addLog({
          productName: productData.name,
          price: productData.price,
          type: "DELETED",
          status: "DELETED",
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, "trash/products");
      }
    },
    restoreFromTrash: async (product) => {
      try {
        const { deletedAt, id, ...productData } = product;
        // Ensure no internal ID field pollutes the new document body
        if (productData.id) delete productData.id;

        await addDoc(collection(db, "products"), {
          ...productData,
          createdAt: new Date().toISOString(),
        });
        await deleteDoc(doc(db, "trash", id));
        await DB.addLog({
          productName: product.name,
          price: product.price,
          type: "RESTORED",
          status: "RESTORED",
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, "products/trash");
      }
    },
    wipeFromTrash: async (id) => {
      try {
        await deleteDoc(doc(db, "trash", id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `trash/${id}`);
      }
    },
    addLog: async (logInfo) => {
      try {
        await addDoc(collection(db, "logs"), {
          ...logInfo,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "logs");
      }
    },
    addCategory: async (categoryData) => {
      try {
        await addDoc(collection(db, "categories"), categoryData);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "categories");
        throw error;
      }
    },
    deleteCategory: async (categoryId) => {
      try {
        await deleteDoc(doc(db, "categories", categoryId));
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.DELETE,
          `categories/${categoryId}`,
        );
        throw error;
      }
    },
    updateOrderStatus: async (orderId, newStatus) => {
      try {
        await updateDoc(doc(db, "orders", orderId), { status: newStatus });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
      }
    },
    saveReview: async (reviewData) => {
      try {
        await addDoc(collection(db, "reviews"), {
          ...reviewData,
          createdAt: new Date().toISOString(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, "reviews");
      }
    },
    updateReviewStatus: async (reviewId, newStatus) => {
      try {
        await updateDoc(doc(db, "reviews", reviewId), { status: newStatus });
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `reviews/${reviewId}`,
        );
      }
    },
    toggleBestReview: async (reviewId, currentState) => {
      try {
        await updateDoc(doc(db, "reviews", reviewId), {
          isBest: !currentState,
        });
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `reviews/${reviewId}/best`,
        );
      }
    },
    deleteReview: async (reviewId) => {
      try {
        await deleteDoc(doc(db, "reviews", reviewId));
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.DELETE,
          `reviews/${reviewId}`,
        );
      }
    },
    deleteAllLogs: async () => {
      try {
        const batch = [];
        state.logs.forEach((log) => {
          batch.push(deleteDoc(doc(db, "logs", log.id)));
        });
        await Promise.all(batch);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, "logs/all");
      }
    },
  };

  // 1. CUSTOM CURSOR
  const cursor = document.querySelector(".cursor");
  const cursorGlow = document.querySelector(".cursor-glow");

  if (cursor && cursorGlow) {
    document.addEventListener("mousemove", (e) => {
      cursor.style.left = e.clientX + "px";
      cursor.style.top = e.clientY + "px";
      setTimeout(() => {
        cursorGlow.style.left = e.clientX - 16 + "px";
        cursorGlow.style.top = e.clientY - 16 + "px";
      }, 50);
    });

    const updateCursorHover = () => {
      const clickables = document.querySelectorAll(
        "a, button, .product-card, .insta-item, [onclick]",
      );
      clickables.forEach((el) => {
        el.addEventListener("mouseenter", () => {
          cursor.style.transform = "scale(4)";
          cursor.style.background = "transparent";
          cursor.style.border = "1px solid white";
        });
        el.addEventListener("mouseleave", () => {
          cursor.style.transform = "scale(1)";
          cursor.style.background = "white";
          cursor.style.border = "none";
        });
      });
    };
    updateCursorHover();
    window.addEventListener("viewChanged", updateCursorHover);
  }

  // 1. BACKGROUND CANVAS ANIMATION
  const canvas = document.getElementById("bg-canvas");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let particles = [];

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    class Particle {
      constructor() {
        this.init();
      }
      init() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = Math.random() * 0.5 - 0.25;
        this.speedY = Math.random() * 0.5 - 0.25;
        this.opacity = Math.random() * 0.5 + 0.1;
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x > canvas.width) this.x = 0;
        if (this.x < 0) this.x = canvas.width;
        if (this.y > canvas.height) this.y = 0;
        if (this.y < 0) this.y = canvas.height;
      }
      draw() {
        ctx.fillStyle = `rgba(138, 43, 226, ${this.opacity})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < 100; i++) particles.push(new Particle());

    const animateBackground = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.update();
        p.draw();
      });
      requestAnimationFrame(animateBackground);
    };
    animateBackground();
  }

  // 2. VIEW CONTROLLER (SPA Logic)
  const sections = {
    home: [
      "home",
      "features",
      "featured",
      "about",
      "testimonials",
      "newsletter",
    ],
    shop: ["shop"],
    cart: ["cart"],
    admin: ["admin"],
    reviews: ["reviews"],
  };

  // 2.1 SECURITY LAYER / FIREWALL
  const ADMIN_EMAIL = "sehabiissam8@gmail.com"; // Hardcoded admin for this project

  const Firewall = {
    isAuthenticated: () => {
      return auth.currentUser !== null;
    },
    isAdmin: () => {
      return (
        Firewall.isAuthenticated() && auth.currentUser.email === ADMIN_EMAIL
      );
    },
    initiateSession: async (email, password) => {
      try {
        console.log("[SESSION_START_REQUEST]", email);
        if (email !== ADMIN_EMAIL) {
          console.warn("[SESSION_REJECTED] NON-ADMIN EMAIL");
          showToast("ACCESS DENIED: UNAUTHORIZED AGENT.");
          return false;
        }
        const result = await signInWithEmailAndPassword(auth, email, password);
        console.log("[FIREBASE_AUTH_RESULT]", result.user.email);
        if (result.user.email === ADMIN_EMAIL) {
          const modal = document.getElementById("admin-gate-modal");
          if (modal) modal.classList.remove("active");
          showToast("SYSTEM ACCESS GRANTED: WELCOME ADMIN.");
          showView("admin");
          return true;
        } else {
          console.warn("[SESSION_REJECTED] AUTH SUCCESS BUT EMAIL MISMATCH");
          showToast("ACCESS DENIED: INSUFFICIENT PRIVILEGES.");
          await signOut(auth);
          return false;
        }
      } catch (error) {
        console.error("[SESSION_ERROR]", error);
        const errorEl = document.getElementById("login-error");
        if (errorEl) {
          errorEl.textContent = "ACCESS DENIED: INVALID KEY OR EMAIL.";
          errorEl.style.display = "block";
          setTimeout(() => (errorEl.style.display = "none"), 3000);
        }
        showToast("AUTH ERROR: REJECTION DETECTED.");
        return false;
      }
    },
    terminateSession: async () => {
      await signOut(auth);
      showToast("SESSION TERMINATED: CLEARING CACHE.");
      showView("home");
    },
    guard: (viewKey) => {
      if (viewKey === "admin" && !Firewall.isAdmin()) {
        console.warn("FIREWALL: UNAUTHORIZED ACCESS ATTEMPT DETECTED.");
        document.getElementById("admin-gate-modal").classList.add("active");
        return false;
      }
      return true;
    },
  };

  // Firebase Auth State Listener
  onAuthStateChanged(auth, async (user) => {
    console.log("[AUTH_STATE_CHANGE]", user ? user.email : "NULL");

    // RE-INIT LISTENERS ON AUTH CHANGE
    // This ensures listeners that require permissions (like orders)
    // are properly established once the auth token is available.
    startListeners();

    if (user) {
      console.log("[AUTH_STATE]", user);
      if (user.email === ADMIN_EMAIL) {
        console.log("ADMIN DETECTED:", user.email);
        const modal = document.getElementById("admin-gate-modal");
        if (modal && modal.classList.contains("active")) {
          modal.classList.remove("active");
          showView("admin");
        }
      } else {
        console.warn("UNAUTHORIZED ACCESS DETECTED: LOGGING OUT.");
        showToast("UNAUTHORIZED AGENT DETECTED. CLEARING SYSTEM.");
        await signOut(auth);
        showView("home");
      }
    } else {
      console.log("UNAUTHENTICATED");
      const sections = document.querySelectorAll("section");
      sections.forEach((s) => {
        if (s.id === "admin" && s.style.display === "block") {
          showView("home");
        }
      });
    }
  });

  // Preload default categories
  const ensureDefaultCategories = async () => {
    const defaults = [
      "Hoodie",
      "T-Shirt",
      "Pants",
      "Jacket",
      "Shoes",
      "Accessories",
    ];
    const existingNames = state.categories.map((c) => c.name);

    for (const defaultName of defaults) {
      if (!existingNames.includes(defaultName)) {
        try {
          await DB.addCategory({
            name: defaultName,
            createdAt: serverTimestamp(),
          });
          console.log(`[SYSTEM] DEFAULT CATEGORY CREATED: ${defaultName}`);
        } catch (error) {
          console.error(
            `[SYSTEM] FAILED TO CREATE DEFAULT CATEGORY: ${defaultName}`,
            error,
          );
        }
      }
    }
  };

  // STARTING FIREBASE REALTIME LISTENERS
  const startListeners = () => {
    console.log("[SYSTEM] SYNCHRONIZING REALTIME STREAMS...");

    // Clear existing listeners to prevent leaks/duplicates
    if (activeListeners.products) activeListeners.products();
    if (activeListeners.orders) activeListeners.orders();
    if (activeListeners.logs) activeListeners.logs();
    if (activeListeners.trash) activeListeners.trash();
    if (activeListeners.reviews) activeListeners.reviews();

    // Products Listener (Public)
    activeListeners.products = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        state.products = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
        renderStore();
        if (Firewall.isAdmin()) renderAdmin();
      },
      (err) => {
        console.warn("[SYSTEM] PRODUCTS_LISTENER_ERR:", err.message);
        handleFirestoreError(err, OperationType.LIST, "products");
      },
    );

    // Orders Listener (Admin Only)
    // If not admin, the listener will naturally fail due to rules, which is handled.
    const ordersRef = collection(db, "orders");
    const ordersQuery = query(ordersRef, orderBy("createdAt", "desc"));

    activeListeners.orders = onSnapshot(
      ordersQuery,
      (snapshot) => {
        console.log("[SYSTEM] ORDERS_SYNC_RECEIVED:", snapshot.docs.length);

        state.orders = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        console.log("[SYSTEM] STATE_ORDERS_UPDATED:", state.orders.length);

        renderAdminOrders();
      },
      (err) => {
        console.error("[SYSTEM] ORDERS_LISTENER_CRITICAL_ERROR:", err.message);
        if (Firewall.isAdmin())
          handleFirestoreError(err, OperationType.LIST, "orders");
      },
    );

    // Logs Listener (Admin Only)
    activeListeners.logs = onSnapshot(
      collection(db, "logs"),
      (snapshot) => {
        state.logs = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
        if (Firewall.isAdmin()) renderLogs();
      },
      (err) => {
        if (Firewall.isAdmin())
          handleFirestoreError(err, OperationType.LIST, "logs");
      },
    );

    // Trash Listener (Admin Only)
    activeListeners.trash = onSnapshot(
      collection(db, "trash"),
      (snapshot) => {
        state.trash = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
        if (Firewall.isAdmin()) renderTrash();
      },
      (err) => {
        if (Firewall.isAdmin())
          handleFirestoreError(err, OperationType.LIST, "trash");
      },
    );

    // Reviews Listener (Mixed - Admin can see all, Public see published)
    activeListeners.reviews = onSnapshot(
      collection(db, "reviews"),
      (snapshot) => {
        state.reviews = snapshot.docs.map((d) => ({ ...d.data(), id: d.id }));
        renderPublicReviews();
        if (Firewall.isAdmin()) renderAdminReviews();
      },
      (err) => {
        console.warn("[SYSTEM] REVIEWS_LISTENER_ERR:", err.message);
        handleFirestoreError(err, OperationType.LIST, "reviews");
      },
    );

    // Categories Listener
    activeListeners.categories = onSnapshot(
      collection(db, "categories"),
      (snapshot) => {
        state.categories = snapshot.docs.map((d) => ({
          ...d.data(),
          id: d.id,
        }));
        renderCategoryOptions();
        renderCategoryFilterBar();
        renderStore();
        if (Firewall.isAdmin()) {
          renderAdminCategories();
          if (state.categories.length === 0) {
            ensureDefaultCategories();
          }
        }
      },
      (err) => {
        console.warn("[SYSTEM] CATEGORIES_LISTENER_ERR:", err.message);
        handleFirestoreError(err, OperationType.LIST, "categories");
      },
    );
  };

  const mobileMenu = document.getElementById("mobile-menu");
  const mobileToggle = document.getElementById("mobile-toggle");
  const menuClose = document.getElementById("menu-close");

  const toggleMobileMenu = () => {
    if (!mobileMenu) return;
    mobileMenu.classList.toggle("active");
    document.body.style.overflow = mobileMenu.classList.contains("active")
      ? "hidden"
      : "auto";
  };

  if (mobileToggle) mobileToggle.addEventListener("click", toggleMobileMenu);
  if (menuClose) menuClose.addEventListener("click", toggleMobileMenu);

  // Admin Sidebar Toggle Logic
  const adminSidebar = document.getElementById("admin-sidebar");
  const adminSidebarToggle = document.getElementById("admin-sidebar-toggle");
  const adminSidebarClose = document.getElementById("admin-sidebar-close");
  const sidebarOverlay = document.getElementById("sidebar-overlay");

  const toggleAdminSidebar = () => {
    if (!adminSidebar) return;
    adminSidebar.classList.toggle("active");
    if (sidebarOverlay) sidebarOverlay.classList.toggle("active");
    document.body.style.overflow = adminSidebar.classList.contains("active")
      ? "hidden"
      : "auto";
  };

  if (adminSidebarToggle)
    adminSidebarToggle.addEventListener("click", toggleAdminSidebar);
  if (adminSidebarClose)
    adminSidebarClose.addEventListener("click", toggleAdminSidebar);
  if (sidebarOverlay)
    sidebarOverlay.addEventListener("click", toggleAdminSidebar);

  // ADMIN TAB SWITCHING
  document.querySelectorAll(".admin-nav-btn[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      // Deactivate all nav buttons
      document.querySelectorAll(".admin-nav-btn[data-tab]").forEach((b) => b.classList.remove("active"));
      // Activate clicked nav button
      btn.classList.add("active");
      // Hide all admin tabs
      document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("active"));
      // Show target tab
      const targetTab = document.getElementById(`admin-${tab}`);
      if (targetTab) targetTab.classList.add("active");
    });
  });

  const showView = (viewKey) => {
    // Firewall Check: Redirect if unauthorized
    if (!Firewall.guard(viewKey)) return;

    const nav = document.querySelector(".nav");
    if (viewKey === "admin") {
      if (nav) nav.style.display = "none";
    } else {
      if (nav) nav.style.display = "flex";
    }

    if (mobileMenu && mobileMenu.classList.contains("active"))
      toggleMobileMenu();

    document.querySelectorAll("section, footer").forEach((el) => {
      el.style.display = "none";
      el.classList.remove("active");
    });

    const toShow = sections[viewKey] || sections.home;
    toShow.forEach((id) => {
      const el =
        document.getElementById(id) || document.querySelector(`.${id}`);
      if (el) {
        el.style.display = "block";
        setTimeout(() => el.classList.add("active"), 50);
      }
    });

    if (viewKey !== "admin") {
      const foot = document.querySelector(".footer");
      if (foot) foot.style.display = "block";
    }

    window.scrollTo(0, 0);
    window.dispatchEvent(new Event("viewChanged"));

    if (viewKey === "shop" || viewKey === "home") renderStore();
    if (viewKey === "home" || viewKey === "reviews") renderPublicReviews();
    if (viewKey === "admin") {
      renderAdmin();
      renderLogs();
      renderTrash();
      renderAdminReviews();
    }
  };

  // 2.1 ADMIN AUTH
  const loginForm = document.getElementById("admin-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      console.log("[LOGIN_FORM_SUBMITTED]");
      console.log("[LOGIN_ATTEMPT]");

      const emailInput = document.getElementById("admin-email");
      const passwordInput = document.getElementById("admin-password");

      if (!emailInput || !passwordInput) {
        console.error("[LOGIN_ERROR] FORM INPUTS NOT FOUND");
        return;
      }

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        showToast("EMAIL AND PASSWORD REQUIRED");
        return;
      }

      try {
        const success = await Firewall.initiateSession(email, password);
        if (success) {
          console.log("[LOGIN_SUCCESS]");
        }
      } catch (error) {
        console.error("[LOGIN_ERROR]", error);
        showToast("LOGIN FAILED");
      }
    });
  }

  // 3. RENDER STORE PRODUCTS
  const getCategoryLabel = (categoryId, fallbackName) => {
    if (!categoryId) return "Uncategorized";
    const category = state.categories.find((c) => c.id === categoryId);
    return category?.name || fallbackName || "Uncategorized";
  };

  const renderStore = () => {
    const products = state.products;
    const mainGrid = document.getElementById("main-product-grid");
    const featuredGrid = document.querySelector("#featured .product-grid");

    const filteredProducts =
      selectedProductCategory === "all"
        ? products
        : products.filter((p) => p.categoryId === selectedProductCategory);

    const productToHTML = (p) => `
            <div class="product-card" data-id="${p.id}" data-name="${p.name}" data-price="${p.price}" data-img="${p.img}">
                <div class="product-img-wrapper">
                    <img src="${p.img}" alt="${p.name}">
                    <div class="product-overlay">
                        <button class="btn btn-mini add-to-cart">ADD TO CART</button>
                    </div>`;

    if (mainGrid)
      mainGrid.innerHTML =
        filteredProducts.length > 0
          ? filteredProducts.map(productToHTML).join("")
          : '<p class="empty-msg">NO PRODUCTS FOUND FOR THIS CATEGORY.</p>';

    if (featuredGrid)
      featuredGrid.innerHTML = products.slice(0, 3).map(productToHTML).join("");
  };

  let selectedProductCategory = "all";

  const getCategoryNames = () => {
    const categoryNames = state.categories
      .filter((cat) => cat && cat.name)
      .map((cat) => cat.name)
      .sort((a, b) => a.localeCompare(b));

    if (!categoryNames.includes("Uncategorized")) {
      categoryNames.push("Uncategorized");
    }

    return categoryNames;
  };

  const getCategoryFilterItems = () => {
    const categories = state.categories || [];
    const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
    return [
      { id: "all", name: "All" },
      ...sorted.map((c) => ({ id: c.id, name: c.name })),
    ];
  };

  const renderCategoryFilterBar = () => {
    const filterBar = document.getElementById("product-filter-bar");
    if (!filterBar) return;

    const items = getCategoryFilterItems();

    // Build dropdown markup: single Filter button + dropdown list
    filterBar.innerHTML = `
      <div class="filter-wrapper">
        <button id="filter-toggle" class="filter-toggle" aria-haspopup="true" aria-expanded="false">Filter</button>
        <div id="filter-dropdown" class="filter-dropdown" role="menu" aria-hidden="true">
          ${items
            .map(
              (it) =>
                `<button type="button" class="filter-item ${
                  selectedProductCategory === it.id ? "active" : ""
                }" data-category-id="${it.id}" role="menuitem">${it.name}</button>`,
            )
            .join("")}
        </div>
      </div>
    `;

    const toggle = filterBar.querySelector("#filter-toggle");
    const dropdown = filterBar.querySelector("#filter-dropdown");

    if (!toggle || !dropdown) return;

    const openDropdown = () => {
      dropdown.classList.add("open");
      dropdown.setAttribute("aria-hidden", "false");
      toggle.setAttribute("aria-expanded", "true");
    };

    const closeDropdown = () => {
      dropdown.classList.remove("open");
      dropdown.setAttribute("aria-hidden", "true");
      toggle.setAttribute("aria-expanded", "false");
    };

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      if (dropdown.classList.contains("open")) closeDropdown();
      else openDropdown();
    });

    // Handle selection
    dropdown.querySelectorAll("button[data-category-id]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = btn.dataset.categoryId;
        // close first for smoother UX
        closeDropdown();
        updateSelectedProductCategory(id);
      });
    });

    // Close when clicking outside (single global listener)
    if (!window.__categoryFilterOutsideListenerAdded) {
      window.addEventListener("click", (e) => {
        const fb = document.getElementById("product-filter-bar");
        if (!fb) return;
        const targetInside = fb.contains(e.target);
        if (!targetInside) {
          const dd = fb.querySelector(".filter-dropdown.open");
          if (dd) {
            dd.classList.remove("open");
            dd.setAttribute("aria-hidden", "true");
            const t = fb.querySelector("#filter-toggle");
            if (t) t.setAttribute("aria-expanded", "false");
          }
        }
      });
      window.__categoryFilterOutsideListenerAdded = true;
    }
  };

  const updateSelectedProductCategory = (categoryId) => {
    if (!categoryId) return;
    selectedProductCategory = categoryId;
    renderCategoryFilterBar();
    renderStore();
  };

  const renderCategoryOptions = (selectedCategoryId = "") => {
    const categorySelect = document.getElementById("p-category");
    if (!categorySelect) return;

    const options = state.categories
      .map(
        (cat) =>
          `<option value="${cat.id}" data-name="${cat.name}">${cat.name}</option>`,
      )
      .concat([
        '<option value="uncategorized" data-name="Uncategorized">Uncategorized</option>',
      ])
      .join("");

    categorySelect.innerHTML = options;

    if (
      selectedCategoryId &&
      categorySelect.querySelector(`option[value="${selectedCategoryId}"]`)
    ) {
      categorySelect.value = selectedCategoryId;
    } else {
      categorySelect.value = categorySelect.options.length
        ? categorySelect.options[0].value
        : "uncategorized";
    }
  };

  const renderAdminCategories = () => {
    if (!Firewall.isAdmin()) return;
    const categories = [...state.categories].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const categoryList = document.getElementById("admin-category-list");
    if (!categoryList) return;

    if (categories.length === 0) {
      categoryList.innerHTML =
        '<tr><td colspan="4" style="text-align:center; opacity: 0.5; padding: 2rem;">NO CATEGORIES CONFIGURED. ADD ONE TO START.</td></tr>';
      return;
    }

    categoryList.innerHTML = categories
      .map((cat) => {
        const productCount = state.products.filter(
          (p) => p.categoryId === cat.id || p.category === cat.name,
        ).length;
        const createdAt = cat.createdAt
          ? new Date(cat.createdAt).toLocaleDateString()
          : "N/A";

        return `
                <tr class="admin-row-trigger" onclick="openCategoryDetail('${cat.id}')">
                    <td><strong style="color:#fff;">${cat.name}</strong></td>
                    <td class="desktop-only">${productCount}</td>
                    <td>${createdAt}</td>
                    <td>
                        <button class="action-btn" onclick="event.stopPropagation(); openCategoryDetail('${cat.id}')">VIEW</button>
                        <button class="action-btn delete-btn" onclick="event.stopPropagation(); confirmDeleteCategory('${cat.id}')">DELETE</button>
                    </td>
                </tr>
            `;
      })
      .join("");
  };

  let categoryToDeleteId = null;

  window.openCategoryDetail = (categoryId) => {
    if (!Firewall.isAdmin()) return;
    const category = state.categories.find((c) => c.id === categoryId);
    if (!category) return;

    const modal = document.getElementById("category-detail-modal");
    const meta = document.getElementById("category-detail-meta");
    const body = document.getElementById("category-detail-products");
    if (!modal || !meta || !body) return;

    const products = state.products.filter(
      (p) => p.categoryId === category.id || p.category === category.name,
    );
    meta.textContent = `${products.length} product${products.length === 1 ? "" : "s"} assigned`;

    if (products.length === 0) {
      body.innerHTML =
        '<p style="opacity: 0.6; padding: 2rem; text-align: center;">NO PRODUCTS ARE CURRENTLY ASSIGNED TO THIS CATEGORY.</p>';
    } else {
      body.innerHTML = products
        .map(
          (prod) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem;border:1px solid rgba(255,255,255,0.06);border-radius:8px;">
                    <div style="display:flex;gap:1rem;align-items:center;">
                        <img src="${prod.img}" alt="${prod.name}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid rgba(255,255,255,0.08);">
                        <div>
                            <strong>${prod.name}</strong>
                            <div style="font-size:0.75rem;opacity:0.65;">${prod.price.toLocaleString()} DZD</div>
                        </div>
                    </div>
                    <button class="btn btn-mini" style="min-width: 110px;" onclick="event.stopPropagation(); openEditProduct('${prod.id}'); document.getElementById('category-detail-modal').classList.remove('active');">EDIT</button>
                </div>
            `,
        )
        .join("");
    }

    modal.classList.add("active");
  };

  window.confirmDeleteCategory = (categoryId) => {
    const category = state.categories.find((c) => c.id === categoryId);
    if (!category) return;

    const productCount = state.products.filter(
      (p) => p.categoryId === category.id || p.category === category.name,
    ).length;
    if (productCount > 0) {
      showToast(
        "CANNOT DELETE CATEGORY: PRODUCTS ARE STILL ASSIGNED. RECATEGORIZE FIRST.",
      );
      return;
    }

    categoryToDeleteId = categoryId;
    const msg = document.getElementById("delete-category-message");
    if (msg)
      msg.textContent = `Delete category “${category.name}”? This cannot be undone.`;
    document.getElementById("delete-category-modal").classList.add("active");
  };

  const confirmDeleteCategoryBtn = document.getElementById(
    "confirm-delete-category-btn",
  );
  if (confirmDeleteCategoryBtn) {
    confirmDeleteCategoryBtn.addEventListener("click", async () => {
      if (!categoryToDeleteId) return;
      confirmDeleteCategoryBtn.disabled = true;
      const originalText = confirmDeleteCategoryBtn.innerHTML;
      confirmDeleteCategoryBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> DELETING...';

      try {
        await DB.deleteCategory(categoryToDeleteId);
        showToast("CATEGORY REMOVED.");
        document
          .getElementById("delete-category-modal")
          .classList.remove("active");
        categoryToDeleteId = null;
      } catch (error) {
        console.error("CATEGORY DELETE ERROR:", error);
        showToast("FAILED TO DELETE CATEGORY.");
      } finally {
        confirmDeleteCategoryBtn.disabled = false;
        confirmDeleteCategoryBtn.innerHTML = originalText;
      }
    });
  }

  const categoryForm = document.getElementById("category-form");
  if (categoryForm) {
    categoryForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!Firewall.isAdmin()) return;

      const nameInput = document.getElementById("category-name");
      if (!nameInput) return;

      const name = nameInput.value.trim();

      if (!name) {
        return showToast("CATEGORY NAME IS REQUIRED.");
      }

      const duplicate = state.categories.some(
        (cat) => cat.name.toLowerCase() === name.toLowerCase(),
      );
      if (duplicate) {
        return showToast("A CATEGORY WITH THIS NAME ALREADY EXISTS.");
      }

      try {
        await DB.addCategory({
          name,
          createdAt: serverTimestamp(),
        });
        showToast("CATEGORY CREATED.");
        categoryForm.reset();
      } catch (error) {
        console.error("CATEGORY CREATE ERROR:", error);
        showToast("FAILED TO CREATE CATEGORY.");
      }
    });
  }

  // 4. CART SYSTEM
  let cart = [];
  const cartBadge = document.querySelector(".cart-count");
  const cartBadgeMobile = document.querySelector(".cart-count-mobile");
  const cartItemsList = document.getElementById("cart-items-list");
  const subtotalEl = document.getElementById("subtotal");
  const totalEl = document.getElementById("total-price");
  let viewingCart = false;

  const updateCartUI = () => {
    const totalQuantity = cart.reduce(
      (acc, item) => acc + (item.quantity || 1),
      0,
    );
    if (cartBadge) cartBadge.textContent = totalQuantity;
    if (cartBadgeMobile) cartBadgeMobile.textContent = totalQuantity;
    if (cartBadge) {
      cartBadge.style.transform = "scale(1.5)";
      setTimeout(() => (cartBadge.style.transform = "scale(1)"), 200);
    }
    if (viewingCart) renderCart();
  };

  const renderCart = () => {
    if (!cartItemsList) return;
    if (cart.length === 0) {
      cartItemsList.innerHTML =
        '<p class="empty-msg">YOUR BAG IS EMPTY. START EXPLORING.</p>';
      if (subtotalEl) subtotalEl.textContent = "0 DZD";
      if (totalEl) totalEl.textContent = "500 DZD";
      return;
    }
    let subtotal = 0;
    cartItemsList.innerHTML = "";
    cart.forEach((item, index) => {
      const itemQty = item.quantity || 1;
      subtotal += item.price * itemQty;
      cartItemsList.insertAdjacentHTML(
        "beforeend",
        `
                <div class="cart-item">
                    <img src="${item.img}" alt="${item.name}" class="cart-item-img">
                    <div class="cart-item-info">
                        <h4 class="cart-item-name">${item.name}</h4>
                        <p class="cart-item-price">${item.price.toLocaleString()} DZD</p>
                        <button class="remove-btn" data-index="${index}"><i class="fa-solid fa-trash-can"></i> REMOVE FROM ENTRANCE</button>
                    </div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" data-index="${index}" data-delta="-1"><i class="fa-solid fa-minus"></i></button>
                        <span>${itemQty}</span>
                        <button class="qty-btn" data-index="${index}" data-delta="1"><i class="fa-solid fa-plus"></i></button>
                    </div>
                </div>
            `,
      );
    });
    if (subtotalEl) subtotalEl.textContent = `${subtotal.toLocaleString()} DZD`;
    if (totalEl)
      totalEl.textContent = `${(subtotal + 500).toLocaleString()} DZD`;
  };

  if (cartItemsList) {
    cartItemsList.addEventListener("click", (e) => {
      const idx = parseInt(e.target.dataset.index);
      if (e.target.classList.contains("remove-btn")) {
        cart.splice(idx, 1);
        updateCartUI();
      } else if (e.target.classList.contains("qty-btn")) {
        const delta = parseInt(e.target.dataset.delta);
        const currentQty = cart[idx].quantity || 1;
        cart[idx].quantity = currentQty + delta;
        if (cart[idx].quantity < 1) cart[idx].quantity = 1;
        updateCartUI();
      }
    });
  }

  document.body.addEventListener("click", (e) => {
    if (e.target.classList.contains("add-to-cart")) {
      const card = e.target.closest(".product-card");
      const product = {
        id: card.dataset.id,
        name: card.dataset.name,
        price: parseInt(card.dataset.price),
        img: card.dataset.img,
        quantity: 1,
      };
      const existing = cart.find((item) => item.id === product.id);
      if (existing) {
        existing.quantity = (existing.quantity || 0) + 1;
      } else {
        cart.push(product);
      }
      updateCartUI();
      const btn = e.target;
      const originalText = btn.textContent;
      btn.textContent = "ADDED!";
      btn.style.background = "white";
      btn.style.color = "black";
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = "var(--accent)";
        btn.style.color = "white";
      }, 1000);
    }
  });

  // 5. ADMIN PANEL LOGIC
  const renderAdmin = () => {
    if (!Firewall.isAdmin()) return;
    renderAdminProducts();
    renderAdminOrders();
    renderAdminCategories();
  };

  const renderAdminProducts = () => {
    if (!Firewall.isAdmin()) return;
    const products = state.products;
    const adminProductList = document.getElementById("admin-product-list");
    if (!adminProductList) return;

    if (products.length === 0) {
      adminProductList.innerHTML =
        '<tr><td colspan="5" style="text-align:center; padding: 2rem; opacity: 0.5;">NO PRODUCTS IN DATABASE</td></tr>';
    } else {
      adminProductList.innerHTML = products
        .map(
          (p) => `
                <tr id="admin-row-${p.id}" class="admin-row-trigger" data-id="${p.id}" data-name="${p.name}">
                    <td><img src="${p.img}" class="admin-img-thumb" alt=""></td>
                    <td>${p.name}</td>
                    <td>${getCategoryLabel(p.categoryId, p.category)}</td>
                    <td>${p.price.toLocaleString()} DZD</td>
                    <td>
                        <div class="desktop-actions">
                            <button class="action-btn edit-btn" onclick="event.stopPropagation(); openEditProduct('${p.id}')"><i class="fa-solid fa-pen"></i></button>
                            <button class="action-btn delete-btn" onclick="event.stopPropagation(); deleteProduct('${p.id}')"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `,
        )
        .join("");
    }
  };

  // HIDE LOADER - ENSURE SYSTEM ENTRANCE
  const hideLoader = () => {
    const loader = document.getElementById("app-loading");
    if (loader) {
      console.log("[SYSTEM] CLEARING APP LOADING OVERLAY.");
      loader.style.opacity = "0";
      setTimeout(() => {
        loader.style.visibility = "hidden";
        loader.remove();
        console.log("[SYSTEM] MAINFRAME SYNC COMPLETE.");
      }, 500);
    }
  };

  // Final safety: release loader after 4 seconds regardless
  setTimeout(hideLoader, 4000);

  // START LISTENERS WILL BE CALLED by onAuthStateChanged once Firebase is initialized
  // Also release loader once products are fetched or on home view
  showView("home");
  console.log("[SYSTEM] INITIALIZATION SEQUENCE TERMINATED.");

  // Slight delay for smooth entrance
  setTimeout(hideLoader, 1500);
});
