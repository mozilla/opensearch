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
}

OpenSearch.prototype = {

  onLoad: function(evt) {
    try {
      var prefBranch =
          Components.classes['@mozilla.org/preferences-service;1'].
          getService(Components.interfaces.nsIPrefBranch2);
      this.glodaCompleter =
        Components.classes["@mozilla.org/autocomplete/search;1?name=gloda"]
                  .getService()
                  .wrappedJSObject;
      var observerSvc = Components.classes["@mozilla.org/observer-service;1"]
                        .getService(Components.interfaces.nsIObserverService);
      observerSvc.addObserver(opensearch, "autocomplete-did-enter-text", false);
      this.glodaCompleter = Components.classes["@mozilla.org/autocomplete/search;1?name=gloda"].getService().wrappedJSObject;
      this.glodaCompleter.completers.push(new WebSearchCompleter());
    } catch (e) {
      logException(e);
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

  doSearch: function(searchterm) {
    try {
      let options = {background : false ,
                     contentPage : "http://www.google.com/search?q=" + encodeURI(searchterm),
                     clickHandler: "opensearch.siteClickHandler(event)"
                    };
      var tabmail = document.getElementById('tabmail');
      var tabthing = tabmail.openTab("contentTab", options);
      var context = tabmail._getTabContextForTabbyThing(tabthing)
      var tab = context[2];
      tab.setAttribute('class', tab.getAttribute('class') + ' google');
      let browser = document.getElementById('tabmail').getBrowserForSelectedTab();
      browser.addEventListener('DOMContentLoaded', this.onDOMContentLoaded, false);
      let hbox = document.createElement('hbox');
      hbox.setAttribute('class', 'mininav hidden');
      let url = document.createElement('textbox');
      url.readonly = true;
      url.setAttribute('readonly', 'true');
      url.setAttribute('class', 'url');
      url.setAttribute('flex', '1');
      url.setAttribute('crop', 'center');
      let back = document.createElement('button');
      back.setAttribute('label', 'back');
      back.setAttribute('class', 'back');
      var backFunc = function (e) {
        document.getElementById('tabmail').getBrowserForSelectedTab().goBack();
      };
      back.addEventListener("click", backFunc, true);
      let forward = document.createElement('button');
      forward.setAttribute('label', 'forward');
      forward.setAttribute('class', 'forward');
      var forwardFunc = function () {
        document.getElementById('tabmail').getBrowserForSelectedTab().goForward();
      };
      forward.addEventListener("click", forwardFunc, true);
      hbox.appendChild(back);
      hbox.appendChild(forward);
      hbox.appendChild(url);
      outerbox = browser.parentNode;
      outerbox.insertBefore(hbox, browser);
      
      // browser navigation (front/back) does not cause onDOMContentLoaded, so we have to use nsIWebProgressListener
      browser.addProgressListener(this);
    } catch (e) {
      logException(e);
    }
  },
  
  QueryInterface: function(aIID)  
  {  
   if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||  
       aIID.equals(Components.interfaces.nsISupportsWeakReference) ||  
       aIID.equals(Components.interfaces.nsISupports))  
     return this;  
   throw Components.results.NS_NOINTERFACE;  
  },
  
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
      outerbox.height = browser.contentDocument.body.scrollHeight  + hbox.clientHeight + 'px';
      browser.height = browser.contentDocument.body.scrollHeight +hbox.clientHeight + 'px';
      browser.minHeight = browser.contentDocument.body.scrollHeight +hbox.clientHeight + 'px';
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
      let uri = makeURI(href);
      if (!this._protocolSvc.isExposedProtocol(uri.scheme) ||
          uri.schemeIs("http") || uri.schemeIs("https")) {
         //if they're still in the search app, keep 'em.
         // XXX: we need a smarter way (both for google and others)
        if ((uri.host == 'www.google.com') && (uri.path.indexOf('/search') == 0)) {
          // default will do.
        } else {
          aEvent.preventDefault();
          openLinkExternally(href);
        }
      }
    }
  }
};
var opensearch = new OpenSearch();

window.addEventListener("load", function(evt) { opensearch.onLoad(evt); }, false);


