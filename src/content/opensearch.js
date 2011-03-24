/* TODO:

- figure out where we want to pick opensearch engines
- do we want multiple entries in the autocomplete?  (Search Web / Search wikipedia / etc?)
- for each search engine, scope the links to stay-in-tb if they're
  a) same domain
  b) for some, include a few extra domains like login, etc.
- move xul mods to an overlay somehow
- bug: session restore restores them as regular contentTabs -- we may need to create
  a new kind of tab ("siteTab"?)
- propose a patch to specialTabs or tabmail that allows tabs to specify
  favicons and or favicon-updating functions

*/


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
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource:///modules/errUtils.js");
var EXTPREFNAME = "extension.opensearch.data";

var searchService = Components.classes["@mozilla.org/browser/search-service;1"]
                              .getService(Components.interfaces
                                                    .nsIBrowserSearchService);

function ResultRowSingle(term) {
  this.term = term;
  this.typeForStyle = "websearch";
  this.nounDef = null;
}

ResultRowSingle.prototype = {
  multi: false,
  fullText: false,
};

function WebSearchCompleter() {
}

WebSearchCompleter.prototype = {
  complete: function WebSearchCompleter_complete(aResult, aString) {
    aResult.addRows([new ResultRowSingle(aString)]);
    // We have nothing pending.
    return false;
  },
  onItemsAdded: function(aItems, aCollection) {
  },
  onItemsModified: function(aItems, aCollection) {
  },
  onItemsRemoved: function(aItems, aCollection) {
  },
  onQueryCompleted: function(aCollection) {
  }
};

function log(whereFrom, engine) {
  let url = "https://opensearch-live.mozillamessaging.com/search" +
        "?provider=" + engine +
        "&from=" + whereFrom;
  let req = new XMLHttpRequest();
  req.open('GET', url);
  req.channel.loadFlags |= Components.interfaces.nsIRequest.LOAD_BYPASS_CACHE;
  req.send(null);
};


/**
 * A tab to show content pages.
 */
var siteTabType = {
  name: "siteTab",
  perTabPanel: "vbox",
  lastBrowserId: 0,
  get loadingTabString() {
    delete this.loadingTabString;
    return this.loadingTabString = document.getElementById("bundle_messenger")
                                           .getString("loadingTab");
  },

  modes: {
    siteTab: {
      type: "siteTab",
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
    let clone = document.getElementById("siteTab").firstChild.cloneNode(true);

    clone.setAttribute("id", "siteTab" + this.lastBrowserId);
    clone.setAttribute("collapsed", false);

    aTab.panel.appendChild(clone);

    let engines = clone.getElementsByTagName("menulist")[0];
    for (var i=0; i<engines.itemCount; i++) {
      let item = engines.getItemAtIndex(i);
      if (aArgs.engine == item.label) {
        engines.selectedIndex = i;
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

    aTab.browser.setAttribute("id", "siteTabBrowser" + this.lastBrowserId);

    aTab.browser.setAttribute("onclick",
                              "clickHandler" in aArgs && aArgs.clickHandler ?
                              aArgs.clickHandler :
                              "specialTabs.defaultClickHandler(event);");

    // Now initialise the find bar.
    aTab.findbar = aTab.panel.getElementsByTagName("findbar")[0];
    aTab.findbar.setAttribute("browserid",
                              "siteTabBrowser" + this.lastBrowserId);

    // Default to reload being disabled.
    aTab.reloadEnabled = false;

    // Now set up the listeners.
    this._setUpTitleListener(aTab);
    this._setUpCloseWindowListener(aTab);
    this._setUpBrowserListener(aTab);

    // Now start loading the content.
    aTab.title = this.loadingTabString;

    aTab.engine = aArgs.engine;
    aTab.query = aArgs.query;

    // Set up onclick/oncommand listeners.
    clone.getElementsByClassName("back")[0].addEventListener("click",
      function (e) {
        aTab.browser.goBack();
      }, true);
    clone.getElementsByClassName("forward")[0].addEventListener("click",
      function () {
        aTab.browser.goForward();
      }, true);
    clone.getElementsByClassName("menulist")[0].addEventListener("command",
      function(e) {
        aTab.engine = e.target.value;
        opensearch.setSearchEngine(e);
      }, true);
    clone.getElementsByTagName("menupopup")[0].addEventListener("popupshowing",
      function() {
        for (var i = 0; i < engines.itemCount; i++ ) {
          let item = engines.getItemAtIndex(i);
          item.setAttribute("checked", "" + (item.value == aTab.engine));
        }
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
    document.getElementById("q").value = aTab.query;
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
    // Wait a bit to let us finish loading.
    setTimeout(function() {
      aTabmail.openTab("siteTab", {contentPage: aPersistedState.tabURI,
                                   clickHandler: aPersistedState.clickHandler,
                                   query: aPersistedState.query,
                                   engine: aPersistedState.engine,
                                   background: true});
    }, 2000);
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
    aTab.browser.addEventListener("DOMTitleChanged",
                                  aTab.titleListener, true);
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
    aTab.browser.addEventListener("DOMWindowClose",
                                  aTab.closeListener, true);
  },

  _setUpBrowserListener: function setUpBrowserListener(aTab) {
    let navbar = aTab.browser.parentNode.firstChild;

    function updateNavButtons() {
      let backButton = navbar.getElementsByClassName("back")[0];
      backButton.setAttribute("disabled", ! aTab.browser.canGoBack);
      let forwardButton = navbar.getElementsByClassName("forward")[0];
      forwardButton.setAttribute("disabled", ! aTab.browser.canGoForward);
    };

    function onDOMContentLoaded(aEvent) {
      try {
        log("browser", aTab.engine);
        updateNavButtons();
        navbar.hidden = (aTab.browser.contentWindow.pageYOffset != 0);
        setTimeout(function() {
          // Scroll up a pixel, if we can, to hide the navbar.
          aTab.browser.contentWindow.scroll(0,1);
        }, 2000);
      } catch (e) {
        logException(e);
      }
    };
    aTab.browser.addEventListener("DOMContentLoaded", onDOMContentLoaded, false);

    // browser navigation (front/back) does not cause onDOMContentLoaded,
    // so we have to use nsIWebProgressListener
    aTab.browser.addProgressListener(opensearch);

    // Create a filter and hook it up to our browser
    aTab.filter = Components.classes["@mozilla.org/appshell/component/browser-status-filter;1"]
                            .createInstance(Components.interfaces.nsIWebProgress);

    // Wire up a progress listener to the filter for this browser
    aTab.progressListener = new tabProgressListener(aTab, false);

    aTab.filter.addProgressListener(aTab.progressListener, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
    aTab.browser.webProgress.addProgressListener(aTab.filter, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
  }
}


function OpenSearch() {

  XPCOMUtils.defineLazyServiceGetter(this, "mPrefs",
                                     "@mozilla.org/preferences-service;1",
                                     "nsIPrefBranch2");

  XPCOMUtils.defineLazyServiceGetter(this, "mOS",
                                     "@mozilla.org/observer-service;1",
                                     "nsIObserverService");

}

OpenSearch.prototype = {

  onLoad: function(evt) {
    try {
      this.mOS.addObserver(opensearch, "autocomplete-did-enter-text", false);
      this.glodaCompleter = Components.classes["@mozilla.org/autocomplete/search;1?name=gloda"].getService().wrappedJSObject;

      // Add us as the second completer.
      this.glodaCompleter.completers.unshift(null);
      this.glodaCompleter.completers[0] = this.glodaCompleter.completers[1];
      this.glodaCompleter.completers[1] = new WebSearchCompleter();

      this.engine = this.engine; // load from prefs
      let tabmail = document.getElementById("tabmail");

      var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                            .getService(Components.interfaces.nsIPrefBranch);

      tabmail.registerTabType(siteTabType);

      // Load our search engines into the service.
      for each (let provider in ["google", "yahoo", "twitter", "amazondotcom",
                                 "answers", "creativecommons", "eBay",
                                 "bing", "wikipedia"]) {
        searchService.addEngine(
            "chrome://opensearch/locale/searchplugins/" + provider + ".xml",
            Components.interfaces.nsISearchEngine.DATA_XML,
            "", false);
      }
      // Wait for the service to finish loading the engines.
      setTimeout(this.finishLoading, 2000);

    } catch (e) {
      logException(e);
    }
  },

  finishLoading: function() {
    try {
      // Put the engines in the correct order.
      for each (let engine in ["Wikipedia (en)", "Bing", "eBay",
                               "Creative Commons", "Answers.com", "Amazon.com",
                               "Twitter Search", "Yahoo", "Google"]) {
        let engineObj = searchService.getEngineByName(engine);
        if (engineObj)
          searchService.moveEngine(engineObj, 0);
      }

      // Load the engines from the service into our menu.
      let engines = document.getElementById("engines");
      for each (let engine in searchService.getVisibleEngines()) {
        let item = engines.appendItem(engine.name, engine.name);
        item.setAttribute("image", engine.iconURI.spec);
        item.setAttribute("type", "radio");
        item.setAttribute("checked", "" + (this.engine == engine.name));
      }
    } catch (e) {
      logException(e);
    }
  },

  initContextPopup: function(event) {
    let menuid = "menu_searchTheWeb";
    if (event.target.id == "mailContext")
      menuid = "mailContext_searchTheWeb";

    let menuitem = document.getElementById(menuid);

    // Change the label to include the selected text.
    let selection = document.commandDispatcher.focusedWindow.getSelection();

    // Or the previously searched-for text.
    if (!selection || selection.isCollapsed)
      selection = this.previousSearchTerm;

    if (selection) {
      menuitem.label = "Search the web for: " + selection;
      menuitem.value = "" + selection;
      menuitem.disabled = false;
    }
    else {
      // Or just disable the item.
      menuitem.label = "Search the web…";
      menuitem.value = "";
      menuitem.disabled = true;
    }

    if (menuid == "menu_searchTheWeb")
      InitMessageMenu();
    else
      return fillMailContextMenu(event);
  },

  setSearchTerm: function(searchterm) {
    this.previousSearchTerm = searchterm;
    let browser = document.getElementById("tabmail").getBrowserForSelectedTab();
    browser.setAttribute("src", this.getSearchURL(searchterm));
  },

  setSearchEngine: function(event) {
    try {
      this.engine = event.target.value;
    } catch (e) {
      logException(e);
    }
  },

  set engine(value) {
    this.mPrefs.setCharPref("opensearch.engine", value);
  },

  get engine() {
    try {
      return this.mPrefs.getCharPref("opensearch.engine");
    } catch (e) {
      if (searchService.defaultEngine != null)
        return searchService.defaultEngine.name;
      return "Google";
    }
  },

  getSearchURL: function(searchterm) {
    try {
      var engine = searchService.getEngineByName(this.engine);
      var submission = engine.getSubmission(searchterm);
      return submission.uri.spec;
    } catch (e) {
      logException(e);
    }
    return "";
  },

  getURLPrefixesForEngine: function() {
    switch (this.engine) {
      case "Yahoo":
        return ["http://search.yahoo.com", "http://www.yahoo.com"];
      case "Google":
        return ["http://www.google.com", "http://www.google.ca", "http://login.google.com"];
      case "Bing":
        return ["http://www.bing.com"];
      case "Wikipedia (en)":
        return ["http://en.wikipedia.org"];
      case "Amazon.com":
        return ["http://www.amazon.com/gp/search/"];
      case "Creative Commons":
        return ["http://search.creativecommons.org"];
      // todo: Answers.com, Creative Commons, and eBay.
    }
    // By default open everything in the default browser.
    return [];
  },


  observe: function(aSubject, aTopic, aData) {
    if (aTopic == "autocomplete-did-enter-text") {
      let selectedIndex = aSubject.popup.selectedIndex;
      let curResult = this.glodaCompleter.curResult;
      if (! curResult)
        return; // autocomplete didn't even finish.
      let row = curResult.getObjectAt(selectedIndex);
      if (!row || (row.typeForStyle != "websearch"))
        return; // It's not our row.
      opensearch.doSearch('gloda', aSubject.state.string);
    }
  },

  get _protocolSvc() {
    delete this._protocolSvc;
    return this._protocolSvc =
      Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                .getService(Components.interfaces.nsIExternalProtocolService);
  },

  updateHeight: function(sync) {
    try {
      window.clearTimeout(opensearch.timeout);
      let f = function () {
        try {
          let browser = opensearch.tabthing.browser;
          let outerbox = browser.parentNode;
          let hbox = outerbox.firstChild;
          outerbox.height = browser.contentDocument.height + hbox.clientHeight + "px";
          window.clearTimeout(opensearch.timeout);
        } catch (e) {
          logException(e);
        }
      }
      if (sync)
        f();
      else
        opensearch.timeout = window.setTimeout(f, 100);
    } catch (e) {
      logException(e);
    }
  },

  doSearch: function(whereFrom, searchterm) {
    try {
      log(whereFrom, this.engine);
      this.previousSearchTerm = searchterm;
      let options = {background: false ,
                     contentPage: this.getSearchURL(searchterm),
                     query: searchterm,
                     engine: this.engine,
                     clickHandler: "opensearch.siteClickHandler(event)"
                    };
      var tabmail = document.getElementById("tabmail");
      tabmail.openTab("siteTab", options);
    } catch (e) {
      logException(e);
    }
  },
  QueryInterface: XPCOMUtils.generateQI([
        Components.interfaces.nsIWebProgressListener,
        Components.interfaces.nsISupportsWeakReference,
        Components.interfaces.nsISupports
        ]),

  onStateChange: function(aWebProgress, aRequest, aFlag, aStatus) {},
  onLocationChange: function(aProgress, aRequest, aURI) {},

  // For definitions of the remaining functions see related documentation
  onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot) { },
  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) { },
  onSecurityChange: function(aWebProgress, aRequest, aState) { },

  goBack: function() {
    try {
      let browser = document.getElementById("tabmail").getBrowserForSelectedTab();
      browser.goBack();
    } catch (e) {
      logException(e);
    }
  },

  goForward: function() {
    let browser = document.getElementById("tabmail").getBrowserForSelectedTab();
    browser.goForward();
  },

  siteClickHandler: function(aEvent) {
    // Don't handle events that: a) aren't trusted, b) have already been
    // handled or c) aren't left-click.
    if (!aEvent.isTrusted || aEvent.getPreventDefault() || aEvent.button)
      return true;

    let href = hRefForClickEvent(aEvent, true);
    if (href) {
      dump("href = " + href + "\n");
      let uri = makeURI(href);
      if (!this._protocolSvc.isExposedProtocol(uri.scheme) ||
          uri.schemeIs("http") || uri.schemeIs("https")) {
         //if they're still in the search app, keep 'em.
         // XXX: we need a smarter way (both for google and others)
        domains = this.getURLPrefixesForEngine();
        var inscope = false;
        for (var i =0; i < domains.length; i++) {
          if (uri.spec.indexOf(domains[i]) == 0) {
            dump("in scope, as " + domains[i] + " == " + uri.host + "\n");
            inscope = true;
            break;
          }
        }
        if (! inscope) {
          aEvent.preventDefault();
          openLinkExternally(href);
        }
      }
    }
  }
};
var opensearch = new OpenSearch();

window.addEventListener("load", function(evt) { opensearch.onLoad(evt); }, false);


