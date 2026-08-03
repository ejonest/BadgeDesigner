/**
 * AQB: Require badge name text before Add to Cart / dynamic checkout.
 * Only activates when [data-aqb-require-name="true"] is present.
 */
(function () {
  function trimValue(el) {
    return (el && el.value ? el.value : '').trim();
  }

  function isSoldOutLabel(submitButton) {
    var label = (submitButton.querySelector('span') || submitButton).textContent || '';
    return /sold out|unavailable/i.test(label.trim());
  }

  function initGroup(group) {
    if (!group || group.dataset.aqbRequireName !== 'true' || group.dataset.aqbBound === 'true') return;
    group.dataset.aqbBound = 'true';

    var sectionId = group.dataset.sectionId || '';
    var nameInput =
      group.querySelector('[data-aqb-badge-name]') ||
      document.getElementById('aqb-name-' + sectionId) ||
      document.querySelector('input[name="properties[Name]"]');
    if (!nameInput) return;

    var formId = nameInput.getAttribute('form');
    var form = (formId && document.getElementById(formId)) || nameInput.closest('form');
    if (!form) return;

    var productForm = form.closest('product-form');
    var submitButton =
      form.querySelector('[type="submit"][name="add"]') ||
      (productForm && productForm.querySelector('[type="submit"][name="add"]'));
    var paymentButtons = form.querySelector('.shopify-payment-button');
    var hint = group.querySelector('[data-aqb-name-hint]');

    function nameIsValid() {
      return trimValue(nameInput).length > 0;
    }

    function sync() {
      var valid = nameIsValid();

      if (hint) hint.hidden = valid;
      group.classList.toggle('aqb-badge-name-incomplete', !valid);

      if (paymentButtons) {
        paymentButtons.style.display = valid ? '' : 'none';
        paymentButtons.setAttribute('aria-hidden', valid ? 'false' : 'true');
      }

      if (!submitButton) return;

      if (!valid) {
        submitButton.setAttribute('disabled', 'disabled');
        submitButton.setAttribute('data-aqb-name-blocked', 'true');
        submitButton.setAttribute('aria-disabled', 'true');
        return;
      }

      if (submitButton.getAttribute('data-aqb-name-blocked') === 'true') {
        submitButton.removeAttribute('data-aqb-name-blocked');
      }

      if (!isSoldOutLabel(submitButton)) {
        submitButton.removeAttribute('disabled');
        submitButton.removeAttribute('aria-disabled');
      }
    }

    nameInput.setAttribute('required', 'required');
    nameInput.setAttribute('aria-required', 'true');

    nameInput.addEventListener('input', sync);
    nameInput.addEventListener('change', sync);
    nameInput.addEventListener('blur', sync);

    form.addEventListener(
      'submit',
      function (evt) {
        if (!nameIsValid()) {
          evt.preventDefault();
          evt.stopImmediatePropagation();
          sync();
          nameInput.focus();
          if (typeof nameInput.reportValidity === 'function') nameInput.reportValidity();
        }
      },
      true
    );

    if (submitButton && typeof MutationObserver !== 'undefined') {
      var observer = new MutationObserver(function () {
        if (!nameIsValid() && submitButton.getAttribute('data-aqb-name-blocked') !== 'true') {
          sync();
        }
      });
      observer.observe(submitButton, { attributes: true, attributeFilter: ['disabled'] });
    }

    sync();
  }

  function initAll() {
    document.querySelectorAll('[data-aqb-require-name="true"]').forEach(initGroup);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  document.addEventListener('shopify:section:load', initAll);
})();
