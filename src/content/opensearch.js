/* TODO:

- figure out where we want to pick opensearch engines
- do we want multiple entries in the autocomplete?  (Search Web / Search wikipedia / etc?)
- for each search engine, scope the links to stay-in-tb if they're
  a) same domain
  b) for some, include a few extra domains like login, etc.
- move xul mods to an overlay somehow
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

// Defined in searchTab.js
// const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

// From mozilla/toolkit/components/search/nsSearchService.js
const NS_APP_SEARCH_DIR_LIST = "SrchPluginsDL";

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/errUtils.js");

function ResultRowSingle(term) {
  this.term = term;
  this.typeForStyle = "websearch";
  this.nounDef = null;
}

ResultRowSingle.prototype = {
  multi: false,
  fullText: false,
};

function WebSearchCompleter() { }

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

function OpenSearch() {

  XPCOMUtils.defineLazyServiceGetter(this, "protocol",
                                     "@mozilla.org/uriloader/external-protocol-service;1",
                                     "nsIExternalProtocolService");

}

OpenSearch.prototype = {

  log: function os_log(whereFrom, engine) {
    let url = "https://opensearch-live.mozillamessaging.com/search" +
          "?provider=" + engine +
          "&from=" + whereFrom;
    let req = new XMLHttpRequest();
    req.open('GET', url);
    req.channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;
    req.send(null);
  },

  // Make ourselves an nsIDirectoryServiceProvider2.
  getFiles : function(prop) {
    if (prop != NS_APP_SEARCH_DIR_LIST)
      return null;

    // Figure out where our search engines are.
    let chromeURL = "chrome://opensearch/locale/searchplugins/";
    var crs = Cc['@mozilla.org/chrome/chrome-registry;1']
                .getService(Ci.nsIChromeRegistry);

    var nsIURI = Services.io.newURI(decodeURI(chromeURL), 'UTF-8', null);
    var fileURL = crs.convertChromeURL(nsIURI).spec;

    // get the nsILocalFile for the file
    var file = Services.io.getProtocolHandler("file")
                          .QueryInterface(Ci.nsIFileProtocolHandler)
                          .getFileFromURLSpec(fileURL);

    // And use our search engines for the list.
    var array = Cc["@mozilla.org/array;1"]
                  .createInstance(Ci.nsIMutableArray);
    array.appendElement(file, false);
    return array.enumerate();
  },

  onLoad: function(evt) {
    try {
      Services.obs.addObserver(this, "autocomplete-did-enter-text", false);
      this.glodaCompleter = Cc["@mozilla.org/autocomplete/search;1?name=gloda"].getService().wrappedJSObject;

      // Add us as the second completer.
      this.glodaCompleter.completers.unshift(null);
      this.glodaCompleter.completers[0] = this.glodaCompleter.completers[1];
      this.glodaCompleter.completers[1] = new WebSearchCompleter();

      this.engine = this.engine; // load from prefs
      document.getElementById("tabmail").registerTabType(searchTabType);

      Services.dirsvc.registerProvider(this);

      // Wait for the service to finish loading the engines.
      setTimeout(this.finishLoading, 2000);

    } catch (e) {
      logException(e);
    }
  },

  onUnLoad: function (evt) {
    Services.obs.removeObserver(this, "autocomplete-did-enter-text", false);
  },

  finishLoading: function() {
    try {
      // Load the engines from the service into our radio buttons.
      let radios = document.getElementById("radios");
      for each (let engine in Services.search.getVisibleEngines()) {
        let radio = radios.appendItem(engine.name, engine.name);
        radio.setAttribute("src", engine.iconURI.spec);
        if (this.engine == engine.name) {
          radios.selectedItem(radio);
        }
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
    Services.prefs.setCharPref("opensearch.engine", value);
  },

  get engine() {
    try {
      return Services.prefs.getCharPref("opensearch.engine");
    } catch (e) {
      if (Services.search.defaultEngine != null)
        return Services.search.defaultEngine.name;
      return "Google";
    }
  },

  getSearchURL: function(searchterm) {
    try {
      let engine = Services.search.getEngineByName(this.engine);
      let submission = engine.getSubmission(searchterm);
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

  doSearch: function(whereFrom, searchterm) {
    try {
      this.log(whereFrom, this.engine);
      this.previousSearchTerm = searchterm;
      let options = {background: false ,
                     contentPage: this.getSearchURL(searchterm),
                     query: searchterm,
                     engine: this.engine,
                     clickHandler: "opensearch.siteClickHandler(event)"
                    };
      document.getElementById("tabmail").openTab("searchTab", options);
    } catch (e) {
      logException(e);
    }
  },
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                         Ci.nsISupportsWeakReference,
                                         Ci.nsISupports,
                                         Ci.nsIDirectoryServiceProvider2]),


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
    try {
      let browser = document.getElementById("tabmail").getBrowserForSelectedTab();
      browser.goForward();
    } catch (e) {
      logException(e);
    }
  },

  siteClickHandler: function(aEvent) {
    // Don't handle events that: a) aren't trusted, b) have already been
    // handled or c) aren't left-click.
    if (!aEvent.isTrusted || aEvent.getPreventDefault() || aEvent.button)
      return true;

    let href = hRefForClickEvent(aEvent, true);
    if (href) {
      Application.console.log("href = " + href + "\n");
      let uri = makeURI(href);
      if (!this.protocol.isExposedProtocol(uri.scheme) ||
          uri.schemeIs("http") || uri.schemeIs("https")) {
         //if they're still in the search app, keep 'em.
         // XXX: we need a smarter way (both for google and others)
        domains = this.getURLPrefixesForEngine();
        let inscope = false;
        for (let i =0; i < domains.length; i++) {
          if (uri.spec.indexOf(domains[i]) == 0) {
            Application.console.log("in scope, as " + domains[i] + " == " +
                                    uri.host + "\n");
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
let opensearch = new OpenSearch();

window.addEventListener("load", function(evt) { opensearch.onLoad(evt); }, false);
window.addEventListener("unload", function(evt) { opensearch.onUnLoad(evt); }, false);
