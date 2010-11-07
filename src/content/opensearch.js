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
    if (aString.length < 3) {
      // In CJK, first name or last name is sometime used as 1 character only.
      // So we allow autocompleted search even if 1 character.
      //
      // [U+3041 - U+9FFF ... Full-width Katakana, Hiragana
      //                      and CJK Ideograph
      // [U+AC00 - U+D7FF ... Hangul
      // [U+F900 - U+FFDC ... CJK compatibility ideograph
      if (!aString.match(/[\u3041-\u9fff\uac00-\ud7ff\uf900-\uffdc]/))
        return false;
    }

    let rows = [new ResultRowSingle(aString)];
    aResult.addRows(rows);
    return true;
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
      this.glodaCompleter.completers.push(new WebSearchCompleter());
      this.engine = this.engine; // load from prefs
      let tabmail = document.getElementById('tabmail');
  
      var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                            .getService(Components.interfaces.nsIPrefBranch);
  
      tabmail.registerTabType(this.siteTabType);
    } catch (e) {
      logException(e);
    }
  },

  setSearchEngine: function(event) {
    try {
      engine = event.target.value;
      this.engine = event.target.value;
      this.mPrefs.setCharPref('opensearch.engine', engine);
      let browser = document.getElementById('tabmail').getBrowserForSelectedTab();
      var tabmail = document.getElementById('tabmail');
      var context = tabmail._getTabContextForTabbyThing(this.tabthing)
      var tab = context[2];
      tab.setAttribute('engine', engine);
      browser.setAttribute("src", this.getSearchURL(this.searchterm));
      this.engine = engine;
    } catch (e) {
      logException(e);
    }
  },
  
  set engine(value) {
    this.mPrefs.setCharPref("opensearch.engine", value);
    if (this.tabthing) {
      var tabmail = document.getElementById('tabmail');
      var context = tabmail._getTabContextForTabbyThing(this.tabthing)
      var tab = context[2];
      tab.setAttribute('class', tab.getAttribute('class') + ' google');
      let browser = document.getElementById('tabmail').getBrowserForSelectedTab();
      browser.addEventListener('DOMContentLoaded', this.onDOMContentLoaded, false);
      tab.setAttribute('engine', this.engine);
      let menulist = tabmail.getElementsByClassName("menulist")[0];
      menulist.setAttribute("value", this.engine);
      browser.setAttribute("src", this.getSearchURL(this.searchterm));
    }
  },
  
  get engine() {
    try {
      return this.mPrefs.getCharPref("opensearch.engine");
    } catch (e) {
      return 'google';
    }
  },
  
  getSearchURL: function(searchterm) {
    switch (this.engine) {
      case 'yahoo':
        return "http://search.yahoo.com/search?p=" + encodeURI(searchterm);
      case 'google':
        return "http://www.google.com/search?q=" + encodeURI(searchterm);
      case 'bing':
        return "http://www.bing.com/search?q=" + encodeURI(searchterm);
      case 'wikpedia':
        return "http://en.wikipedia.org/wiki/Special:Search?search=" + encodeURI(searchterm);
    }
    return '';
  },

  getURLPrefixesForEngine: function() {
    switch (this.engine) {
      case 'yahoo':
        return ['http://search.yahoo.com', 'http://www.yahoo.com'];
      case 'google':
        return ['http://www.google.com/search', 'http://google.com/search', 'http://login.google.com'];
      case 'bing':
        return ['http://www.bing.com'];
      case 'wikipedia':
        return ['http://en.wikipedia.org'];
    }
  },


/**
   * A tab to show content pages.
   */
  siteTabType: {
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

      // Create a filter and hook it up to our browser
      let filter = Components.classes["@mozilla.org/appshell/component/browser-status-filter;1"]
                             .createInstance(Components.interfaces.nsIWebProgress);
      aTab.filter = filter;
      aTab.browser.webProgress.addProgressListener(filter, Components.interfaces.nsIWebProgress.NOTIFY_ALL);

      // Wire up a progress listener to the filter for this browser
      aTab.progressListener = new tabProgressListener(aTab, false);

      filter.addProgressListener(aTab.progressListener, Components.interfaces.nsIWebProgress.NOTIFY_ALL);

      // Now start loading the content.
      aTab.title = this.loadingTabString;

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
        clickHandler: onClick ? onClick : null
      };
    },
    restoreTab: function onRestoreTab(aTabmail, aPersistedState) {
      aTabmail.openTab("siteTab", { contentPage: aPersistedState.tabURI,
                                       clickHandler: aPersistedState.clickHandler,
                                       background: true } );
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
    }
  },

  observe: function(aSubject, aTopic, aData) {
    if (aTopic == 'autocomplete-did-enter-text') {
      let selectedIndex = aSubject.popup.selectedIndex;
      let curResult = this.glodaCompleter.curResult;
      if (! curResult)
        return; // autocomplete didn't even finish.
      let row = curResult.getObjectAt(selectedIndex);
      if (row.typeForStyle != 'websearch') return;
      opensearch.doSearch(aSubject.state.string);
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
      dump('in updateHeight\n');
      window.clearTimeout(opensearch.timeout);
      let f = function () {
        dump('timedout\n');
        try {
          let browser = opensearch.tabthing.browser;
          let outerbox = browser.parentNode;
          let hbox = outerbox.firstChild;
          dump("browser.contentDocument.height = " + browser.contentDocument.height + '\n');
          outerbox.height = browser.contentDocument.height + hbox.clientHeight + 'px';
          //browser.height = browser.contentDocument.height +hbox.clientHeight + 'px';
          //browser.minHeight = browser.contentDocument.height +hbox.clientHeight + 'px';
          dump("browser.contentDocument.height = " + browser.contentDocument.height + '\n');
          window.clearTimeout(opensearch.timeout);
        } catch (e) {
          logException(e);
        }
      }
      if (sync) {
        dump('doing it sync\n');
        f();
      }
      else {
        opensearch.timeout = window.setTimeout(f, 100);
      }
    } catch (e) {
      logException(e);
    }
  },
  
  doSearch: function(searchterm) {
    try {
      this.searchterm = searchterm;
      let options = {background : false ,
                     contentPage : this.getSearchURL(searchterm),
                     clickHandler: "opensearch.siteClickHandler(event)"
                    };
      var tabmail = document.getElementById('tabmail');
      var tabthing = tabmail.openTab("siteTab", options);
      this.tabthing = tabthing;
      var context = tabmail._getTabContextForTabbyThing(tabthing)
      var tab = context[2];
      tab.setAttribute('class', tab.getAttribute('class') + ' google');
      let browser = document.getElementById('tabmail').getBrowserForSelectedTab();
      browser.addEventListener('DOMContentLoaded', this.onDOMContentLoaded, false);
      tab.setAttribute('engine', this.engine);
      let menulist = tabmail.getElementsByClassName("menulist")[0];
      menulist.setAttribute("value", this.engine);
      let outerbox = browser.parentNode;
      let backButton = outerbox.getElementsByClassName('back')[0];
      var backFunc = function (e) {
        document.getElementById('tabmail').getBrowserForSelectedTab().goBack();
      };
      backButton.addEventListener("click", backFunc, true);
      let forwardButton = outerbox.getElementsByClassName('forward')[0];
      var forwardFunc = function () {
        document.getElementById('tabmail').getBrowserForSelectedTab().goForward();
      };
      forwardButton.addEventListener("click", forwardFunc, true);

      // browser navigation (front/back) does not cause onDOMContentLoaded, so we have to use nsIWebProgressListener
      browser.addProgressListener(this);
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
  onLocationChange: function(aProgress, aRequest, aURI)  
  {
    this.updateNavButtons(aURI.spec);
  },
  
  updateNavButtons: function(uristring) {
      let browser = document.getElementById('tabmail').getBrowserForSelectedTab();
      let outerbox = browser.parentNode;
      let hbox = outerbox.firstChild;
      let backButton = hbox.getElementsByClassName('back')[0];
      backButton.setAttribute("disabled", ! browser.canGoBack);
      let forwardButton = hbox.getElementsByClassName('forward')[0];
      forwardButton.setAttribute("disabled", ! browser.canGoForward);
      let url = hbox.getElementsByClassName('url')[0];
      url.setAttribute("value", uristring);
  },
  
  // For definitions of the remaining functions see related documentation  
  onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot) { },
  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) { },
  onSecurityChange: function(aWebProgress, aRequest, aState) { },

  onDOMContentLoaded: function() {
    try {
      let browser = document.getElementById('tabmail').getBrowserForSelectedTab();
      opensearch.updateNavButtons(browser.contentDocument.location);
      let outerbox = browser.parentNode;
      let hbox = outerbox.firstChild;
      hbox.setAttribute('class', 'mininav'); // remove 'hidden';
      // XXX something's not right when we go from a short page through links to a longer page
      outerbox.height = browser.contentDocument.height  + hbox.clientHeight + 'px';
      browser.height = browser.contentDocument.height +hbox.clientHeight + 'px';
      browser.minHeight = browser.contentDocument.height +hbox.clientHeight + 'px';
      outerbox.style.overflowY = "auto";
      outerbox.scrollTop = hbox.clientHeight + 1;  // for border - XXX fix.
      browser.style.overflow = "hidden";
    } catch (e) {
      logException(e);
    }
  },
  
  goBack: function() {
    try {
      let browser = document.getElementById('tabmail').getBrowserForSelectedTab();
      browser.goBack();
    } catch (e) {
      logException(e);
    }
  },

  goForward: function() {
    let browser = document.getElementById('tabmail').getBrowserForSelectedTab();
    browser.goForward();
  },

  siteClickHandler: function(aEvent) {
    // Don't handle events that: a) aren't trusted, b) have already been
    // handled or c) aren't left-click.
    if (!aEvent.isTrusted || aEvent.getPreventDefault() || aEvent.button)
      return true;

    let href = hRefForClickEvent(aEvent, true);
    if (href) {
      dump("href = " + href + '\n');
      let uri = makeURI(href);
      if (!this._protocolSvc.isExposedProtocol(uri.scheme) ||
          uri.schemeIs("http") || uri.schemeIs("https")) {
         //if they're still in the search app, keep 'em.
         // XXX: we need a smarter way (both for google and others)
        domains = this.getURLPrefixesForEngine();
        var inscope = false;
        for (var i =0; i < domains.length; i++) {
          if (uri.spec.indexOf(domains[i]) == 0) {
            dump('in scope, as ' + domains[i] + ' == ' + uri.host + '\n');
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


