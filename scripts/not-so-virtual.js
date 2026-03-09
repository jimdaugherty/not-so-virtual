/**
 * Not So Virtual — Mobile UI for FoundryVTT v13
 *
 * Provides a phone/tablet-friendly overlay covering:
 *   • Character sheet (dnd5e-aware, graceful fallback for other systems)
 *   • Combat tracker
 *   • Chat (send & receive)
 *   • Journal browser
 *
 * This module intentionally only activates on mobile/tablet devices.
 * Canvas is disabled via CONFIG.Canvas.disabled for performance.
 */

const MODULE_ID = "not-so-virtual";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

// ─── Utility ──────────────────────────────────────────────────────────────────

function isMobileDevice() {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
  );
}

function signedNum(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

// ─── Main Application (ApplicationV2) ─────────────────────────────────────────

class NotSoVirtualApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "not-so-virtual-app",
    classes: ["not-so-virtual"],
    window: {
      frame: false,
      positioned: false,
    },
  };

  static PARTS = {
    app: {
      template: `modules/${MODULE_ID}/templates/nsv-app.hbs`,
      scrollable: [".nsv-tab-panel", ".nsv-chat-log"],
    },
  };

  _activeTab = "character";
  _journalId = null;

  // ─── Context ─────────────────────────────────────────────────────────────────

  async _prepareContext(options) {
    const actor = game.user?.character ?? null;
    const systemId = game.system?.id ?? "";

    return {
      activeTab: this._activeTab,
      character: this._buildCharacterData(actor, systemId),
      combat: this._buildCombatData(),
      messages: this._buildChatData(),
      journals: this._buildJournalList(),
      openJournal: this._buildOpenJournal(),
      isGM: game.user?.isGM ?? false,
      systemId,
    };
  }

  _buildCharacterData(actor, systemId) {
    if (!actor) return null;

    const sys = actor.system ?? {};

    // ── HP ──────────────────────────────────────────────────────────────────
    let hp = null;
    const rawHp = sys.attributes?.hp ?? sys.hp ?? null;
    if (rawHp) {
      const val = rawHp.value ?? 0;
      const max = rawHp.max ?? 1;
      const temp = rawHp.temp ?? 0;
      const pct = clamp(Math.round((val / max) * 100), 0, 100);
      hp = {
        value: val,
        max,
        temp,
        percent: pct,
        cssClass: pct > 50 ? "healthy" : pct > 25 ? "wounded" : "critical",
      };
    }

    // ── AC ──────────────────────────────────────────────────────────────────
    const ac =
      sys.attributes?.ac?.value ??
      sys.attributes?.ac ??
      sys.ac?.value ??
      null;

    // ── Initiative / Speed / Prof ────────────────────────────────────────────
    const initiative =
      sys.attributes?.init?.total ??
      sys.attributes?.init?.value ??
      null;
    const speed =
      sys.attributes?.movement?.walk ??
      sys.attributes?.speed?.value ??
      sys.attributes?.speed ??
      null;
    const profBonus = sys.attributes?.prof ?? sys.prof ?? null;

    // ── Abilities ───────────────────────────────────────────────────────────
    let abilities = null;
    if (sys.abilities) {
      abilities = Object.entries(sys.abilities).map(([key, val]) => {
        const score = val.value ?? 10;
        const mod = val.mod ?? Math.floor((score - 10) / 2);
        const saveTotal =
          val.saveBonus !== undefined
            ? signedNum(mod + (val.saveBonus ?? 0))
            : val.save !== undefined
            ? signedNum(val.save.value ?? mod)
            : null;
        return {
          key,
          label: key.toUpperCase().slice(0, 3),
          score,
          mod: signedNum(mod),
          saveTotal,
          saveProficient: val.proficient ?? false,
        };
      });
    }

    // ── Skills ──────────────────────────────────────────────────────────────
    let skills = null;
    if (sys.skills) {
      skills = Object.entries(sys.skills)
        .map(([key, val]) => ({
          key,
          label:
            game.i18n.localize(
              `DND5E.Skill${key.charAt(0).toUpperCase() + key.slice(1)}`
            ) || key,
          total: signedNum(val.total ?? val.value ?? 0),
          passive: val.passive ?? 0,
          proficient: (val.value ?? 0) >= 1,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    // ── Spell slots ──────────────────────────────────────────────────────────
    let spellSlots = null;
    if (sys.spells) {
      spellSlots = Object.entries(sys.spells)
        .filter(([, s]) => s.max > 0)
        .map(([key, s]) => ({
          key,
          label: key === "pact" ? "Pact" : `L${key.replace("spell", "")}`,
          value: s.value,
          max: s.max,
          pips: Array.from({ length: s.max }, (_, i) => i < s.value),
        }));
    }

    // ── Items ────────────────────────────────────────────────────────────────
    const items = actor.items?.contents ?? [];
    const weapons = items.filter((i) => i.type === "weapon");
    const spells = items
      .filter((i) => i.type === "spell")
      .sort(
        (a, b) =>
          (a.system?.level ?? 0) - (b.system?.level ?? 0) ||
          a.name.localeCompare(b.name)
      );
    const features = items.filter((i) =>
      ["feat", "feature", "action"].includes(i.type)
    );
    const equipment = items.filter((i) =>
      ["equipment", "consumable", "tool", "backpack", "loot"].includes(i.type)
    );

    return {
      id: actor.id,
      name: actor.name,
      img: actor.img,
      type: actor.type,
      hp,
      ac,
      initiative: initiative !== null ? signedNum(initiative) : null,
      speed,
      profBonus: profBonus !== null ? signedNum(profBonus) : null,
      abilities,
      skills,
      spellSlots,
      weapons,
      spells,
      features,
      equipment,
    };
  }

  _buildCombatData() {
    const combat = game.combat;
    if (!combat) return { active: false, turns: [] };

    const currentId = combat.current?.combatantId;
    const turns = combat.turns.map((t) => {
      const rawHp = t.actor?.system?.attributes?.hp ?? null;
      let hp = null;
      if (rawHp) {
        const pct = clamp(
          Math.round((rawHp.value / (rawHp.max || 1)) * 100),
          0,
          100
        );
        hp = { value: rawHp.value, max: rawHp.max, percent: pct };
      }
      return {
        id: t.id,
        name: t.name,
        img: t.img,
        initiative: t.initiative ?? "—",
        hasInitiative: t.initiative !== null,
        isActive: t.id === currentId,
        isDefeated: t.isDefeated,
        isOwner: t.isOwner || game.user?.isGM,
        hp,
      };
    });

    const myCombatant = game.combat.getCombatantsByActor?.(
      game.user?.character?.id ?? ""
    )?.[0];

    return {
      active: combat.started,
      round: combat.round,
      turns,
      hasInitiative: myCombatant?.initiative !== null,
    };
  }

  _buildChatData() {
    return (game.messages?.contents ?? []).slice(-60).map((msg) => ({
      id: msg.id,
      content: msg.content,
      speaker: msg.speaker?.alias || msg.author?.name || "?",
      timestamp: new Date(msg.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      isRoll: msg.isRoll,
      whisper: msg.whisper?.length > 0,
      flavor: msg.flavor || null,
    }));
  }

  _buildJournalList() {
    return (game.journal?.contents ?? []).map((j) => ({
      id: j.id,
      name: j.name,
      img: j.img,
      pageCount: j.pages?.size ?? 0,
    }));
  }

  _buildOpenJournal() {
    if (!this._journalId) return null;
    const journal = game.journal?.get(this._journalId);
    if (!journal) return null;

    return {
      name: journal.name,
      pages: (journal.pages?.contents ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        content: p.text?.content ?? "",
      })),
    };
  }

  // ─── Listeners ───────────────────────────────────────────────────────────────

  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    // ── Collapsible sections ─────────────────────────────────────────────────
    html.find(".nsv-toggle").on("click", (e) => {
      const section = e.currentTarget.closest(".nsv-section");
      const body = section?.querySelector(".nsv-section-body");
      if (!body) return;
      section.classList.toggle("open");
      body.classList.toggle("nsv-hidden");
    });

    // ── Tab nav ──────────────────────────────────────────────────────────────
    html.find(".nsv-nav-btn").on("click", (e) => {
      const tab = e.currentTarget.dataset.tab;
      this._switchTab(tab, html);
    });

    // ── HP edit ──────────────────────────────────────────────────────────────
    html.find(".nsv-hp-value").on("change", async (e) => {
      const actor = game.user?.character;
      if (!actor) return;
      const v = parseInt(e.currentTarget.value);
      if (!isNaN(v)) await actor.update({ "system.attributes.hp.value": v });
    });

    // ── Ability / save rolls ─────────────────────────────────────────────────
    html.find("[data-action='roll-ability']").on("click", async (e) => {
      const actor = game.user?.character;
      if (!actor) return;
      await actor.rollAbilityTest(e.currentTarget.dataset.ability, { event: e });
    });

    html.find("[data-action='roll-save']").on("click", async (e) => {
      const actor = game.user?.character;
      if (!actor) return;
      await actor.rollSavingThrow(e.currentTarget.dataset.ability, { event: e });
    });

    html.find("[data-action='roll-skill']").on("click", async (e) => {
      const actor = game.user?.character;
      if (!actor) return;
      await actor.rollSkill(e.currentTarget.dataset.skill, { event: e });
    });

    // ── Item actions ─────────────────────────────────────────────────────────
    html.find("[data-action='roll-attack']").on("click", async (e) => {
      const actor = game.user?.character;
      if (!actor) return;
      const itemId = e.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (!itemId) return;
      const item = actor.items.get(itemId);
      if (!item) return;
      if (item.rollAttack) await item.rollAttack({ event: e });
      else if (item.use) await item.use({ event: e });
    });

    html.find("[data-action='use-item']").on("click", async (e) => {
      const actor = game.user?.character;
      if (!actor) return;
      const itemId = e.currentTarget.closest("[data-item-id]")?.dataset.itemId;
      if (!itemId) return;
      const item = actor.items.get(itemId);
      if (!item) return;
      if (item.use) await item.use({ event: e });
    });

    html.find("[data-action='item-expand']").on("click", (e) => {
      e.currentTarget.closest(".nsv-item-row")?.classList.toggle("expanded");
    });

    // ── Spell slots ──────────────────────────────────────────────────────────
    html.find("[data-action='slot-use']").on("click", async (e) => {
      const actor = game.user?.character;
      if (!actor) return;
      const level = e.currentTarget.dataset.level;
      const cur = actor.system.spells?.[level]?.value ?? 0;
      if (cur > 0)
        await actor.update({ [`system.spells.${level}.value`]: cur - 1 });
    });

    html.find("[data-action='slot-restore']").on("click", async (e) => {
      const actor = game.user?.character;
      if (!actor) return;
      const level = e.currentTarget.dataset.level;
      const cur = actor.system.spells?.[level]?.value ?? 0;
      const max = actor.system.spells?.[level]?.max ?? 0;
      if (cur < max)
        await actor.update({ [`system.spells.${level}.value`]: cur + 1 });
    });

    // ── Combat ───────────────────────────────────────────────────────────────
    html.find("[data-action='roll-initiative']").on("click", async () => {
      const actor = game.user?.character;
      if (!actor) return;
      if (!game.combat) {
        ui.notifications?.warn("No active combat encounter.");
        return;
      }
      const existing = game.combat.getCombatantsByActor?.(actor.id)?.[0];
      if (existing) await game.combat.rollInitiative([existing.id]);
      else await actor.rollInitiative({ createCombatants: true });
    });

    html.find("[data-action='next-turn']").on("click", async () => {
      if (!game.user?.isGM) return;
      await game.combat?.nextTurn();
    });

    html.find("[data-action='end-combat']").on("click", async () => {
      if (!game.user?.isGM) return;
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "End Combat" },
        content: "<p>End the current combat encounter?</p>",
      });
      if (confirmed) await game.combat?.endCombat();
    });

    // ── Chat ─────────────────────────────────────────────────────────────────
    const chatInput = html.find(".nsv-chat-input")[0];

    html.find("[data-action='chat-send']").on("click", () =>
      this._sendChat(chatInput)
    );

    html.find(".nsv-chat-input").on("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this._sendChat(chatInput);
      }
    });

    // Scroll chat to bottom on render
    const chatLog = html.find(".nsv-chat-log")[0];
    if (chatLog) chatLog.scrollTop = chatLog.scrollHeight;

    // ── Chat card action buttons (attack / damage from dnd5e chat cards) ──────
    this._attachChatLogHandlers(chatLog);

    // ── Journal ──────────────────────────────────────────────────────────────
    html.find(".nsv-journal-item").on("click", async (e) => {
      this._journalId = e.currentTarget.dataset.journalId;
      await this.render();
      this._switchTab("journal", $(this.element));
    });

    html.find("[data-action='journal-back']").on("click", async () => {
      this._journalId = null;
      await this.render();
      this._switchTab("journal", $(this.element));
    });
  }

  _switchTab(tab, html) {
    this._activeTab = tab;
    html.find(".nsv-tab-panel").removeClass("nsv-active");
    html.find(`.nsv-tab-panel[data-tab="${tab}"]`).addClass("nsv-active");
    html.find(".nsv-nav-btn").removeClass("nsv-active");
    html.find(`.nsv-nav-btn[data-tab="${tab}"]`).addClass("nsv-active");

    if (tab === "chat") {
      const chatLog = html.find(".nsv-chat-log")[0];
      if (chatLog) setTimeout(() => (chatLog.scrollTop = chatLog.scrollHeight), 50);
    }
  }

  async _sendChat(input) {
    const content = input?.value?.trim();
    if (!content) return;

    if (content.startsWith("/")) {
      const msg = await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker(),
        content,
      }).catch(() => null);
      if (!msg)
        await ui.chat
          ?.processMessage(content)
          .catch((err) => console.warn("Not So Virtual |", err));
    } else {
      await ChatMessage.create({
        user: game.user.id,
        speaker: ChatMessage.getSpeaker(),
        content,
        style: CONST.CHAT_MESSAGE_STYLES?.OOC ?? 0,
      });
    }

    if (input) input.value = "";
  }

  // ─── Chat card action handling ────────────────────────────────────────────

  /** Attach delegated click handler to the chat log for dnd5e chat card buttons. */
  _attachChatLogHandlers(chatLogEl) {
    if (!chatLogEl) return;
    const $chatLog = $(chatLogEl);
    $chatLog.off("click.nsvchatcard").on(
      "click.nsvchatcard",
      ".nsv-message-content button[data-action]",
      async (e) => {
        const button = e.currentTarget;
        const action = button.dataset.action;
        const normalized = this._normalizeChatAction(action);
        if (normalized !== "attack" && normalized !== "damage") return;
        e.preventDefault();
        e.stopPropagation();
        const msgEl = button.closest("[data-message-id]");
        if (!msgEl) return;
        const message = game.messages?.get(msgEl.dataset.messageId);
        if (!message) return;
        await this._handleChatCardAction(message, button, normalized);
      }
    );
  }

  /** Normalise action names across different dnd5e versions. */
  _normalizeChatAction(action) {
    if (["attack", "rollAttack", "roll-attack"].includes(action)) return "attack";
    if (["damage", "rollDamage", "roll-damage"].includes(action)) return "damage";
    return action;
  }

  /** Resolve actor + item from the chat card and dispatch to the correct dialog. */
  async _handleChatCardAction(message, button, normalizedAction) {
    const card =
      button.closest("[data-item-id]") ??
      button.closest("[data-item-uuid]") ??
      button.closest(".chat-card") ??
      button.closest(".dnd5e2");

    const itemId = card?.dataset.itemId;
    const actorId = card?.dataset.actorId;
    const itemUuid = card?.dataset.itemUuid;
    const actorUuid = card?.dataset.actorUuid;

    let actor = null;
    if (actorUuid) {
      try { actor = await fromUuid(actorUuid); } catch (err) {
        console.debug("Not So Virtual | Failed to resolve actor from UUID:", actorUuid, err);
      }
    }
    if (!actor && actorId) actor = game.actors?.get(actorId);
    if (!actor) actor = game.user?.character;
    if (!actor) {
      ui.notifications?.warn(game.i18n.localize("NSV.Error.NoActor"));
      return;
    }

    let item = null;
    if (itemUuid) {
      try { item = await fromUuid(itemUuid); } catch (err) {
        console.debug("Not So Virtual | Failed to resolve item from UUID:", itemUuid, err);
      }
    }
    if (!item && itemId) item = actor.items?.get(itemId);
    if (!item) {
      ui.notifications?.warn(game.i18n.localize("NSV.Error.NoItem"));
      return;
    }

    if (normalizedAction === "attack") await this._showAttackDialog(item);
    else if (normalizedAction === "damage") await this._showDamageDialog(item);
  }

  /** Full-page dialog for choosing attack mode then rolling. */
  async _showAttackDialog(item) {
    const choice = await this._showFullPageDialog(
      `${item.name} — ${game.i18n.localize("NSV.Dialog.Attack.Title")}`,
      [
        { label: game.i18n.localize("NSV.Dialog.Attack.Normal"),       value: "normal",       cssClass: "nsv-btn-primary" },
        { label: game.i18n.localize("NSV.Dialog.Attack.Advantage"),    value: "advantage",    cssClass: "nsv-btn-success" },
        { label: game.i18n.localize("NSV.Dialog.Attack.Disadvantage"), value: "disadvantage", cssClass: "nsv-btn-danger"  },
      ]
    );
    if (choice === null) return;
    const opts = { advantage: choice === "advantage", disadvantage: choice === "disadvantage" };
    if (item.rollAttack) await item.rollAttack(opts);
    else if (item.use) await item.use(opts);
  }

  /** Full-page dialog for choosing normal vs critical damage then rolling. */
  async _showDamageDialog(item) {
    const choice = await this._showFullPageDialog(
      `${item.name} — ${game.i18n.localize("NSV.Dialog.Damage.Title")}`,
      [
        { label: game.i18n.localize("NSV.Dialog.Damage.Normal"),   value: "normal",   cssClass: "nsv-btn-primary" },
        { label: game.i18n.localize("NSV.Dialog.Damage.Critical"), value: "critical", cssClass: "nsv-btn-danger"  },
      ]
    );
    if (choice === null) return;
    const opts = { critical: choice === "critical" };
    if (item.rollDamage) await item.rollDamage(opts);
    else if (item.use) await item.use(opts);
  }

  /**
   * Display a full-page modal overlay with a set of option buttons.
   * Returns a Promise that resolves to the chosen button's value, or null if cancelled.
   *
   * @param {string} title   - Dialog heading text
   * @param {Array<{label:string, value:string, cssClass:string}>} buttons
   * @returns {Promise<string|null>}
   */
  _showFullPageDialog(title, buttons) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      // Inherit NSV CSS variables via the `not-so-virtual` class
      overlay.className = "nsv-dialog-overlay not-so-virtual";

      const btnHtml = buttons
        .map(
          (b) => {
            // Allow only word chars and hyphens in CSS class names to prevent attribute injection
            const safeClass = (b.cssClass ?? "").replace(/[^\w-]/g, "");
            return (
              `<button class="nsv-btn nsv-dialog-option ${safeClass}" ` +
              `data-value="${foundry.utils.escapeHTML(String(b.value))}">${foundry.utils.escapeHTML(b.label)}</button>`
            );
          }
        )
        .join("");

      overlay.innerHTML = `
        <div class="nsv-dialog">
          <h2 class="nsv-dialog-title">${foundry.utils.escapeHTML(title)}</h2>
          <div class="nsv-dialog-buttons">${btnHtml}</div>
          <button class="nsv-btn nsv-dialog-cancel">${foundry.utils.escapeHTML(game.i18n.localize("Cancel"))}</button>
        </div>`;

      overlay.querySelectorAll(".nsv-dialog-option").forEach((btn) => {
        btn.addEventListener("click", () => {
          overlay.remove();
          resolve(btn.dataset.value);
        });
      });

      overlay.querySelector(".nsv-dialog-cancel").addEventListener("click", () => {
        overlay.remove();
        resolve(null);
      });

      document.body.appendChild(overlay);
    });
  }

  // ─── Targeted refresh helpers ─────────────────────────────────────────────

  refreshChat() {
    if (!this.rendered) return;
    const messages = this._buildChatData();
    const chatLog = $(this.element).find(".nsv-chat-log");
    if (!chatLog.length) return;

    chatLog.html(
      messages
        .map(
          (m) => `
        <div class="nsv-message${m.isRoll ? " nsv-roll" : ""}${m.whisper ? " nsv-whisper" : ""}" data-message-id="${m.id}">
          <div class="nsv-message-meta">
            <span class="nsv-message-speaker">${foundry.utils.escapeHTML(m.speaker)}</span>
            <span class="nsv-message-time">${m.timestamp}</span>
            ${m.whisper ? `<span class="nsv-whisper-badge">whisper</span>` : ""}
          </div>
          ${m.flavor ? `<div class="nsv-message-flavor">${m.flavor}</div>` : ""}
          <div class="nsv-message-content">${m.content}</div>
        </div>`
        )
        .join("")
    );

    chatLog[0].scrollTop = chatLog[0].scrollHeight;
  }

  refreshCombat() {
    if (this.rendered && this._activeTab === "combat") this.render();
  }

  refreshCharacter() {
    if (this.rendered && this._activeTab === "character") this.render();
  }
}

// ─── Module Bootstrap ─────────────────────────────────────────────────────────

let nsvApp = null;

Hooks.once("init", () => {
  console.log("Not So Virtual | Initializing");

  game.settings.register(MODULE_ID, "disableCanvas", {
    name: "NSV.Settings.DisableCanvas.Name",
    hint: "NSV.Settings.DisableCanvas.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => window.location.reload(),
  });

  // Register Handlebars helpers
  Handlebars.registerHelper("nsv-pips", (filled, max) => {
    let out = "";
    for (let i = 0; i < max; i++) {
      out += `<span class="nsv-pip${i < filled ? " filled" : ""}"></span>`;
    }
    return new Handlebars.SafeString(out);
  });

  Handlebars.registerHelper("eq", function (a, b, options) {
    return a === b ? options.fn(this) : options.inverse(this);
  });

  Handlebars.registerHelper("gt", function (a, b, options) {
    return a > b ? options.fn(this) : options.inverse(this);
  });

  // Only disable the canvas on mobile devices
  if (!isMobileDevice()) return;

  const disableCanvas = (() => {
    try {
      return game.settings.get(MODULE_ID, "disableCanvas");
    } catch {
      return true;
    }
  })();

  if (disableCanvas) {
    CONFIG.Canvas.disabled = true;
    console.log("Not So Virtual | Canvas disabled for mobile client");
  }
});

Hooks.once("ready", () => {
  if (!isMobileDevice()) {
    console.log("Not So Virtual | Non-mobile device detected — module inactive");
    return;
  }

  console.log("Not So Virtual | Mobile device detected — launching UI");
  nsvApp = new NotSoVirtualApp();
  nsvApp.render(true);
});

// ─── Live-update hooks ────────────────────────────────────────────────────────
// These only fire when nsvApp exists (i.e. on mobile), so no guard needed.

Hooks.on("createChatMessage", () => nsvApp?.refreshChat());
Hooks.on("updateActor", (actor) => {
  if (actor.id === game.user?.character?.id) nsvApp?.refreshCharacter();
});
Hooks.on("updateCombat", () => nsvApp?.refreshCombat());
Hooks.on("updateCombatant", () => nsvApp?.refreshCombat());
Hooks.on("createCombatant", () => nsvApp?.refreshCombat());
Hooks.on("deleteCombatant", () => nsvApp?.refreshCombat());
Hooks.on("deleteCombat", () => nsvApp?.refreshCombat());
