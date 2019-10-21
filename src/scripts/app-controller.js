/* global PushClient, MaterialComponentsSnippets */
/* eslint-env browser */

class AppController {
  constructor() {

    // This div contains the UI for CURL commands to trigger a push
    this._sendPushOptions = document.querySelector('.js-send-push-options');
    this._payloadTextField = document.querySelector('.js-payload-textfield');
    this._payloadTextField.oninput = () => {
      this.updatePushInfo();
    };
    this._username = 'YOUR_USERNAME';
    const appId = window.location.hostname.replace(/^[^\.]+-([^\.-]+)\.+/, '$1');
    if( appId ) {
      fetch(`/mobileservices/application/${appId}/userservice/application/${appId}/v1/Me`).then((response) => {
        if (response.status == 200) {
          response.json().then((meservice) => {
            this._username = meservice.id;
            this.updatePushInfo();
          });
        }
      });
    }

    // Below this comment is code to initialise a material design lite view.
    const toggleSwitch = document.querySelector('.js-push-toggle-switch');
    if (toggleSwitch.classList.contains('is-upgraded')) {
      this.ready = Promise.resolve();
      this._uiInitialised(toggleSwitch.MaterialSwitch);
    } else {
      this.ready = new Promise((resolve) => {
        const mdlUpgradeCb = () => {
          if (!toggleSwitch.classList.contains('is-upgraded')) {
            return;
          }

          this._uiInitialised(toggleSwitch.MaterialSwitch);
          document.removeEventListener(mdlUpgradeCb);

          resolve();
        };

        // This is to wait for MDL initialising
        document.addEventListener('mdl-componentupgraded', mdlUpgradeCb);
      });
    }
  }

  _uiInitialised(toggleSwitch) {
    this._stateChangeListener = this._stateChangeListener.bind(this);
    this._subscriptionUpdate = this._subscriptionUpdate.bind(this);

    this._toggleSwitch = toggleSwitch;

    // this loads the public key from Mobile Services
    fetch('/mobileservices/push/v1/runtime/applications/dummy/pushconfigurations/os/w3cpushapi/pushid').then((response) => {
      if (response.status >= 400 && response.status < 500) {
        return response.text()
          .then((responseText) => {
            console.log('Failed web push response: ', response, response.status);
            throw new Error(`Failed to send push message via web push protocol: ` +
              `<pre>${encodeURI(responseText)}</pre>`);
          });
      }
      else {
        response.json().then((pushid) => {
          this._pushClient = new PushClient(
            this._stateChangeListener,
            this._subscriptionUpdate,
            pushid.pushId
          );
        });
      }
    });

    document.querySelector('.js-push-toggle-switch > input')
      .addEventListener('click', (event) => {
        // Inverted because clicking will change the checked state by
        // the time we get here
        if (event.target.checked) {
          this._pushClient.subscribeDevice();
        } else {
          this._pushClient.unsubscribeDevice();
        }
      });

    // allow snippets to be copied via click
    new MaterialComponentsSnippets().init();
  }

  registerServiceWorker() {
    // Check that service workers are supported
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./service-worker.js')
        .catch((err) => {
          this.showErrorMessage(
            'Unable to Register SW',
            'Sorry this demo requires a service worker to work and it ' +
            'failed to install - sorry :('
          );
          console.error(err);
        });
    } else {
      this.showErrorMessage(
        'Service Worker Not Supported',
        'Sorry this demo requires service worker support in your browser. ' +
        'Please try this demo in Chrome or Firefox Nightly.'
      );
    }
  }

  _stateChangeListener(state, data) {
    if (typeof state.interactive !== 'undefined') {
      if (state.interactive) {
        this._toggleSwitch.enable();
      } else {
        this._toggleSwitch.disable();
      }
    }

    if (typeof state.pushEnabled !== 'undefined') {
      if (state.pushEnabled) {
        this._toggleSwitch.on();
      } else {
        this._toggleSwitch.off();
      }
    }

    switch (state.id) {
      case 'UNSUPPORTED':
        this.showErrorMessage(
          'Push Not Supported',
          data
        );
        break;
      case 'ERROR':
        this.showErrorMessage(
          'Ooops a Problem Occurred',
          data
        );
        break;
      default:
        break;
    }
  }

  _subscriptionUpdate(subscription) {
    this._currentSubscription = subscription;
    var deviceId = localStorage.getItem("mobile-device-id");
    if (!deviceId) {
      deviceId = Math.floor(Math.random() * 1000000000).toString();
      localStorage.setItem("mobile-device-id", deviceId)
    }
    if (!subscription) {
      // Remove any subscription from Mobile Services
      this._sendPushOptions.style.opacity = 0;
      fetch('/mobileservices/push/v1/runtime/applications/any/os/w3cpushapi/devices/' + deviceId, {
        method: 'DELETE',
        cache: 'no-cache'
      }).then((response) => {
        console.log('Push registration delete response: ', response, response.status);
      });
      return;
    }
    // try to register the browser - if ther is a conflict we will update the existing record
    fetch('/mobileservices/push/v1/runtime/applications/any/os/w3cpushapi/devices/' + deviceId, {
      method: 'POST',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pushToken: JSON.stringify(subscription) })
    }).then((response) => {
      if (response.status == 409) {
        fetch('/mobileservices/push/v1/runtime/applications/any/os/w3cpushapi/devices/' + deviceId, {
          method: 'PUT',
          cache: 'no-cache',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pushToken: JSON.stringify(subscription) })
        }).then((response) => {
          console.log('Push registration update response: ', response, response.status);
        });
      } else {
        console.log('Push registration response: ', response, response.status);
      }
    });

    // This is too handle old versions of Firefox where keys would exist
    // but auth wouldn't
    const payloadTextfieldContainer = document.querySelector(
      '.js-payload-textfield-container');
    const subscriptionObject = JSON.parse(JSON.stringify(subscription));
    if (
      subscriptionObject &&
      subscriptionObject.keys &&
      subscriptionObject.keys.auth &&
      subscriptionObject.keys.p256dh) {
      payloadTextfieldContainer.classList.remove('hidden');
    } else {
      payloadTextfieldContainer.classList.add('hidden');
    }

    this.updatePushInfo();

    // Display the UI
    this._sendPushOptions.style.opacity = 1;
  }

  updatePushInfo() {
    // Let's look at payload
    let payloadText = this._payloadTextField.value;
    if (!payloadText) {
      payloadText = 'Message from Mobile Services';
    }
    let curlCommand = `curl -H 'x-api-key: API_KEY_FROM_PUSH_SERVICE_KEY' -H 'content-type: application/json' --data '{"users":["${this._username}"],"notification": {"alert":"${payloadText}"}}' URL_FROM_PUSH_SERVICE_KEY/mobileservices/push/v1/backend/applications/any/notifications/users`;
    let curlError = null;

    const curlCodeElement = document.querySelector('.js-curl-code');
    const curlMsgElement = document.querySelector('.js-curl-copy-msg');
    const curlErrorMsgElement = document.querySelector('.js-curl-error-msg');

    curlCodeElement.textContent = curlCommand;
    curlCodeElement.style.display = 'block';
    curlMsgElement.style.display = 'block';
    curlErrorMsgElement.style.display = 'none';
  }

  toBase64(arrayBuffer, start, end) {
    start = start || 0;
    end = end || arrayBuffer.byteLength;

    const partialBuffer = new Uint8Array(arrayBuffer.slice(start, end));
    return btoa(String.fromCharCode.apply(null, partialBuffer));
  }

  showErrorMessage(title, message) {
    const errorContainer = document
      .querySelector('.js-error-message-container');

    const titleElement = errorContainer.querySelector('.js-error-title');
    const messageElement = errorContainer.querySelector('.js-error-message');
    titleElement.textContent = title;
    messageElement.innerHTML = message;
    errorContainer.style.opacity = 1;

    const pushOptionsContainer = document
      .querySelector('.js-send-push-options');
    pushOptionsContainer.style.display = 'none';
  }
}

if (window) {
  window.onload = function () {
    if (!navigator.serviceWorker) {
      console.warn('Service worker not supported.');
      return;
    }
    if (!('PushManager' in window)) {
      console.warn('Push not supported.');
      return;
    }

    const appController = new AppController();
    appController.ready
      .then(() => {
        document.body.dataset.simplePushDemoLoaded = true;

        const host = 'gauntface.github.io';
        if (
          window.location.host === host &&
          window.location.protocol !== 'https:') {
          // Enforce HTTPS
          window.location.protocol = 'https';
        }

        appController.registerServiceWorker();
      });
  };
}
