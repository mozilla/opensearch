/* ***** BEGIN LICENSE BLOCK *****
 *   Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is opensearch.
 *
 * The Initial Developer of the Original Code is
 * David Ascher.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/errUtils.js");


/**
 * A tab to show search results.
 */
let searchTabType = {
  name: "searchTab",
  perTabPanel: "vbox",
  lastBrowserId: 0,
  bundle: Services.strings.createBundle("chrome://opensearch/locale/opensearch.properties"),

  get loadingTabString() {
    delete this.loadingTabString;
    return this.loadingTabString = document.getElementById("bundle_messenger")
                                           .getString("loadingTab");
  },

  modes: {
    searchTab: {
      type: "searchTab",
      maxTabs: 10
    }
  },

  shouldSwitchTo: function onSwitchTo({contentPage: aContentPage}) {
    let tabmail = document.getElementById("tabmail");
    let tabInfo = tabmail.tabInfo;

    // Remove any anchors - especially for the about: pages, we just want
    // to re-use the same tab.
    let regEx = new RegExp("#.*");

    let contentUrl = aContentPage.replace(regEx, "");

    for (let selectedIndex = 0; selectedIndex < tabInfo.length;
         ++selectedIndex) {
      if (tabInfo[selectedIndex].mode.name == this.name &&
          tabInfo[selectedIndex].browser.currentURI.spec
                                .replace(regEx, "") == contentUrl) {
        // Ensure we go to the correct location on the page.
        tabInfo[selectedIndex].browser
                              .setAttribute("src", aContentPage);
        return selectedIndex;
      }
    }
    return -1;
  },

  openTab: function onTabOpened(aTab, aArgs) {
    if (!"contentPage" in aArgs)
      throw("contentPage must be specified");

    // First clone the page and set up the basics.
    let clone = document.getElementById("searchTab").firstChild.cloneNode(true);

    clone.setAttribute("id", "searchTab" + this.lastBrowserId);
    clone.setAttribute("collapsed", false);

    aTab.panel.appendChild(clone);

    let engines = clone.getElementsByClassName("engines")[0];
    for (let i=0; i<engines.childNodes.length; i++) {
      let item = engines.childNodes[i];
      if (aArgs.engine == item.getAttribute("tooltiptext")) {
        item.checked = true;
        break;
      }
    }

    // Start setting up the browser.
    aTab.browser = aTab.panel.getElementsByTagName("browser")[0];

    // As we're opening this tab, showTab may not get called, so set
    // the type according to if we're opening in background or not.
    let background = ("background" in aArgs) && aArgs.background;
    aTab.browser.setAttribute("type", background ? "content-targetable" :
                                                   "content-primary");

    aTab.browser.setAttribute("id", "searchTabBrowser" + this.lastBrowserId);

    aTab.browser.setAttribute("onclick",
                              "clickHandler" in aArgs && aArgs.clickHandler ?
                              aArgs.clickHandler :
                              "specialTabs.defaultClickHandler(event);");

    // Now initialise the find bar.
    aTab.findbar = aTab.panel.getElementsByTagName("findbar")[0];
    aTab.findbar.setAttribute("browserid",
                              "searchTabBrowser" + this.lastBrowserId);

    // Default to reload being disabled.
    aTab.reloadEnabled = false;

    aTab.engine = aArgs.engine;
    aTab.query = aArgs.query;

    // Now set up the listeners.
    this._setUpTitleListener(aTab);
    this._setUpCloseWindowListener(aTab);
    this._setUpBrowserListener(aTab);
    this._setUpEngineListener(aTab);

    // Now start loading the content.
    aTab.title = this.loadingTabString;

    aTab.check = clone.getElementsByClassName("check")[0];
    this._setDefaultButtonState(aTab, aTab.engine == opensearch.engine);

    // Set up onclick/oncommand listeners.
    let self = this;
    clone.getElementsByClassName("back")[0].addEventListener("click",
      function (e) {
        aTab.browser.goBack();
        self._setDefaultButtonState(aTab, aTab.engine == opensearch.engine);
      }, true);
    clone.getElementsByClassName("forward")[0].addEventListener("click",
      function () {
        aTab.browser.goForward();
        self._setDefaultButtonState(aTab, aTab.engine == opensearch.engine);
      }, true);
    clone.getElementsByClassName("engines")[0].addEventListener("command",
      function(e) {
        if (e.target.localName != "toolbarbutton") return;
        aTab.engine = e.target.getAttribute("tooltiptext");
        opensearch.doSearch("browser", aTab.engine, aTab.query, aTab.browser);
        self._setDefaultButtonState(aTab, aTab.engine == opensearch.engine);
      }, true);
    aTab.check.addEventListener("click",
      function () {
        opensearch.engine = aTab.engine;
        self._setDefaultButtonState(aTab, true);
        Application.console.log("Check click check? "+aTab.check.checked);
      }, true);

    aTab.browser.loadURI(aArgs.contentPage);

    this.lastBrowserId++;
  },

  closeTab: function onTabClosed(aTab) {
    aTab.browser.removeEventListener("DOMTitleChanged",
                                     aTab.titleListener, true);
    aTab.browser.removeEventListener("DOMWindowClose",
                                     aTab.closeListener, true);
    aTab.browser.webProgress.removeProgressListener(aTab.filter);
    aTab.filter.removeProgressListener(aTab.progressListener);
    aTab.browser.destroy();
  },

  saveTabState: function onSaveTabState(aTab) {
    aTab.browser.setAttribute("type", "content-targetable");
  },

  showTab: function onShowTab(aTab) {
    aTab.browser.setAttribute("type", "content-primary");
  },

  persistTab: function onPersistTab(aTab) {
    if (aTab.browser.currentURI.spec == "about:blank")
      return null;

    let onClick = aTab.browser.getAttribute("onclick");

    return {
      tabURI: aTab.browser.currentURI.spec,
      query: aTab.query,
      engine: aTab.engine,
      clickHandler: onClick ? onClick : null
    };
  },

  restoreTab: function onRestoreTab(aTabmail, aPersistedState) {
    aTabmail.openTab("searchTab", {contentPage: aPersistedState.tabURI,
                                   clickHandler: aPersistedState.clickHandler,
                                   query: aPersistedState.query,
                                   engine: aPersistedState.engine,
                                   background: true});
  },

  supportsCommand: function supportsCommand(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
      case "cmd_printSetup":
      case "cmd_print":
      case "button_print":
      case "cmd_stop":
      case "cmd_reload":
      // XXX print preview not currently supported - bug 497994 to implement.
      // case "cmd_printpreview":
        return true;
      default:
        return false;
    }
  },

  isCommandEnabled: function isCommandEnabled(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
      case "cmd_fullZoomEnlarge":
      case "cmd_fullZoomReset":
      case "cmd_fullZoomToggle":
      case "cmd_find":
      case "cmd_findAgain":
      case "cmd_findPrevious":
      case "cmd_printSetup":
      case "cmd_print":
      case "button_print":
      // XXX print preview not currently supported - bug 497994 to implement.
      // case "cmd_printpreview":
        return true;
      case "cmd_reload":
        return aTab.reloadEnabled;
      case "cmd_stop":
        return aTab.busy;
      default:
        return false;
    }
  },

  doCommand: function isCommandEnabled(aCommand, aTab) {
    switch (aCommand) {
      case "cmd_fullZoomReduce":
        ZoomManager.reduce();
        break;
      case "cmd_fullZoomEnlarge":
        ZoomManager.enlarge();
        break;
      case "cmd_fullZoomReset":
        ZoomManager.reset();
        break;
      case "cmd_fullZoomToggle":
        ZoomManager.toggleZoom();
        break;
      case "cmd_find":
        aTab.findbar.onFindCommand();
        break;
      case "cmd_findAgain":
        aTab.findbar.onFindAgainCommand(false);
        break;
      case "cmd_findPrevious":
        aTab.findbar.onFindAgainCommand(true);
        break;
      case "cmd_printSetup":
        PrintUtils.showPageSetup();
        break;
      case "cmd_print":
        PrintUtils.print();
        break;
      // XXX print preview not currently supported - bug 497994 to implement.
      //case "cmd_printpreview":
      //  PrintUtils.printPreview();
      //  break;
      case "cmd_stop":
        aTab.browser.stop();
        break;
      case "cmd_reload":
        aTab.browser.reload();
        break;
    }
  },

  getBrowser: function getBrowser(aTab) {
    return aTab.browser;
  },

  // Internal function used to set up the title listener on a content tab.
  _setUpTitleListener: function setUpTitleListener(aTab) {
    function onDOMTitleChanged(aEvent) {
      aTab.title = aTab.browser.contentTitle;
      document.getElementById("tabmail").setTabTitle(aTab);
    }
    // Save the function we'll use as listener so we can remove it later.
    aTab.titleListener = onDOMTitleChanged;
    // Add the listener.
    aTab.browser.addEventListener("DOMTitleChanged", aTab.titleListener, true);
  },

  _setDefaultButtonState: function setDefaultButtonState(aTab, isDefault) {
    aTab.check.checked = isDefault;
    let key = "browser.search." + (isDefault ? "isDefault" : "setDefault");
    aTab.check.tooltipText = this.bundle.GetStringFromName(key);
  },

  /**
   * Internal function used to set up the close window listener on a content
   * tab.
   */
  _setUpCloseWindowListener: function setUpCloseWindowListener(aTab) {
    function onDOMWindowClose(aEvent) {
      if (!aEvent.isTrusted)
        return;

      // Redirect any window.close events to closing the tab. As a 3-pane tab
      // must be open, we don't need to worry about being the last tab open.
      document.getElementById("tabmail").closeTab(aTab);
      aEvent.preventDefault();
    }
    // Save the function we'll use as listener so we can remove it later.
    aTab.closeListener = onDOMWindowClose;
    // Add the listener.
    aTab.browser.addEventListener("DOMWindowClose", aTab.closeListener, true);
  },

  _setUpBrowserListener: function setUpBrowserListener(aTab) {
    // Browser navigation (front/back) does not cause onDOMContentLoaded,
    // so we have to use nsIWebProgressListener
    this.progressListener = {
      QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                             Ci.nsISupportsWeakReference,
                                             Ci.nsISupports]),

      onLocationChange: function(aProgress, aRequest, aURI) {
        let navbar = aTab.browser.parentNode.firstChild;

        let backButton = navbar.getElementsByClassName("back")[0];
        let forwardButton = navbar.getElementsByClassName("forward")[0];
        backButton.setAttribute("disabled", !aTab.browser.canGoBack);
        forwardButton.setAttribute("disabled", !aTab.browser.canGoForward);
      },

      onStateChange: function(aWebProgress, aRequest, aFlag, aStatus) {},
      onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf,
                                 curTot, maxTot) {},
      onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {},
      onSecurityChange: function(aWebProgress, aRequest, aState) {},
    };

    aTab.browser.addProgressListener(this.progressListener);

    // Create a filter and hook it up to our browser
    aTab.filter = Cc["@mozilla.org/appshell/component/browser-status-filter;1"]
                    .createInstance(Ci.nsIWebProgress);

    // Wire up a progress listener to the filter for this browser
    aTab.progressListener = new tabProgressListener(aTab, false);

    aTab.filter.addProgressListener(aTab.progressListener,
                                    Ci.nsIWebProgress.NOTIFY_ALL);
    aTab.browser.webProgress.addProgressListener(aTab.filter,
                                                 Ci.nsIWebProgress.NOTIFY_ALL);
  },

  _setUpEngineListener: function(aTab) {
    let engineListener = {
      addEngines: function() {
        try {
          let engines = aTab.panel.getElementsByClassName("engines")[0];
          for each (let engine in Services.search.getVisibleEngines()) {
            let button = document.createElement("toolbarbutton");
            button.setAttribute("type", "radio");
            button.setAttribute("group", "engines");
            button.setAttribute("image", engine.iconURI.spec);
            button.setAttribute("tooltiptext", engine.name);
            if (aTab.engine == engine.name)
              button.setAttribute("checked", true);
            engines.appendChild(button);
          }
        } catch (e) {
          logException(e);
        }
      },
    };

    opensearch.addEngines(engineListener);
  },
};
