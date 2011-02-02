/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
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
 * The Original Code is Opensearch Test code.
 *
 * The Initial Developer of the Original Code is
 * The Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Blake Winton <bwinton@latte.ca>
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

/**
 * @fileoverview This is very basic test for opensearch which is meant for the
 * integration with Mozilla test suite.
 */

var MODULE_NAME = "test-opensearch-installed";

const RELATIVE_ROOT = "../../../shared-modules";

var MODULE_REQUIRES = ["folder-display-helpers", "window-helpers"];


/**
 * Sets up the test module by acquiring a browser controller.
 * @param {module} module object for the test used by Mozmill.
 */
function setupModule(module) {
  let fdh = collector.getModule("folder-display-helpers");
  fdh.installInto(module);

  let wh = collector.getModule("window-helpers");
  wh.installInto(module);

  mc.sleep(10000);
  folder = create_folder("OpensearchFolder");
  // we need a message so we can select it so we can find in message
  make_new_sets_in_folder(folder, [{count: 1}]);
  be_in_folder(folder);
}

/**
 * This test just verifies the element can be found.
 */
function test_opensearch_installed() {
  mc.ewait("mailContext-search");
}

/**
 * This tests verifies that we can select some words in the message, and
 * right-click to search for them.
 */
function test_right_click_search() {
  // focus explicitly on the thread pane so we know where the focus is.
  mc.e("threadTree").focus();
  // select the text of a message so we can find in message
  select_click_row(0);
  assert_selected_and_displayed(0);
  let pane = mc.e("messagepane");
  let doc = pane.contentDocument;
  let selection = pane.contentWindow.getSelection();
  let range = doc.createRange();
  range.selectNode(doc.body);
  selection.removeAllRanges();
  selection.addRange(range);

  // Right-click in the message, and populate the search menu by opening it.
  mc.rightClick(mc.eid("messagepane"));
  mc.click_menus_in_sequence(mc.e("mailContext"), [{id:"mailContext-search"}]);

  // make sure the text is in the menu item.
  let menuitem = mc.e("mailContext-searchTheWeb");
  let expected = ("" + range).trim();
  assert_equals(menuitem.disabled, false, "Search menuitem shouldn't be disabled.");
  assert_equals(menuitem.value.trim(), expected,
               "Search menuitem value is different from selection.");
  assert_true(menuitem.label.indexOf(expected) != -1,
              "Search menuitem label doesn't contain selection.");
  // click the menu item.
  // make sure we've searched for the text.
}
