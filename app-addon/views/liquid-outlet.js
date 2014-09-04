import Ember from "ember";
import { Promise, animate, stop } from "vendor/liquid-fire";

export default Ember.ContainerView.extend({
  classNames: ['liquid-container'],
  growDuration: 250,
  growPixelsPerSecond: 200,
  growEasing: 'slide',
  enableGrowth: true,

  init: function(){
    // The ContainerView constructor normally sticks our "currentView"
    // directly into _childViews, but we want to leave that up to
    // _currentViewDidChange so we have the opportunity to launch a
    // transition.
    this._super();
    Ember.A(this._childViews).clear();
  },

  // Deliberately overriding a private method from
  // Ember.ContainerView!
  //
  // We need to stop it from destroying our outgoing child view
  // prematurely.
  _currentViewWillChange: Ember.beforeObserver('currentView', function() {}),

  // Deliberately overriding a private method from
  // Ember.ContainerView!
  _currentViewDidChange: Ember.on('init', Ember.observer('currentView', function() {
    // Normally there is only one child (the view we're
    // replacing). But sometimes there may be two children (because a
    // transition is already in progress). In any case, we tell all of
    // them to start heading for the exits now.

    var oldView = this.get('childViews.lastObject'),
        newView = this.get('currentView');

    // Idempotence
    if ((!oldView && !newView) ||
        (oldView && oldView.get('currentView') === newView) ||
        (this._runningTransition &&
         this._runningTransition.oldView === oldView &&
         this._runningTransition.newContent === newView
        )) {
      return;
    }

    // `transitions` comes from dependency injection, see the
    // liquid-fire app initializer.
    var transition = this.get('transitions').transitionFor(this, oldView, newView, this.get('use'));

    if (this._runningTransition) {
      this._runningTransition.interrupt();
    }

    this._runningTransition = transition;
    transition.run().catch(function(err){
      // Force any errors through to the RSVP error handler, because
      // of https://github.com/tildeio/rsvp.js/pull/278.  The fix got
      // into Ember 1.7, so we can drop this once we decide 1.6 is
      // EOL.
      Ember.RSVP.Promise.cast()._onerror(err);
    });
  })),

  _liquidChildFor: function(content) {
    if (content && !content.get('hasLiquidContext')){
      content.set('liquidContext', content.get('context'));
    }
    var LiquidChild = this.container.lookupFactory('view:liquid-child');
    return LiquidChild.create({
      currentView: content
    });
  },

  _pushNewView: function(newView) {
    var child = this._liquidChildFor(newView),
        promise = new Promise(function(resolve) {
          child._resolveInsertion = resolve;
        });
    this.pushObject(child);
    return promise;
  },

  cacheSize: function() {
    var elt = this.$();
    if (elt) {
      // Measure original size.
      this._cachedSize = {
        width: elt.outerWidth(),
        height: elt.outerHeight()
      };
    }
  },

  unlockSize: function() {
    var self = this;
    function doUnlock(){
      var elt = self.$();
      if (elt) {
        elt.css({width: '', height: ''});
      }
    }
    if (this._scaling) {
      this._scaling.then(doUnlock);
    } else {
      doUnlock();
    }
  },

  _durationFor: function(before, after) {
    return Math.min(this.get('growDuration'), 1000*Math.abs(before - after)/this.get('growPixelsPerSecond'));
  },

  _adaptDimension: function(dimension, before, after) {
    if (before === after || !this.get('enableGrowth')) {
      var elt = this.$();
      if (elt) {
        elt[dimension](after);
      }
      return Promise.cast();
    } else {
      var target = {};
      target[dimension] = [after, before];
      return animate(this, target, {
        duration: this._durationFor(before, after),
        queue: false,
        easing: this.get('growEasing')
      });
    }
  },

  adaptSize: function() {
    stop(this);

    var elt = this.$();
    if (!elt) { return; }

    // Measure new size.
    var newSize = {
      width: elt.outerWidth(),
      height: elt.outerHeight()
    };
    if (typeof(this._cachedSize) === 'undefined') {
      this._cachedSize = newSize;
    }

    // Now that measurements have been taken, lock the size
    // before the invoking the scaling transition.
    elt.outerWidth(this._cachedSize.width);
    elt.outerHeight(this._cachedSize.height);

    this._scaling = Promise.all([
      this._adaptDimension('width', this._cachedSize.width, newSize.width),
      this._adaptDimension('height', this._cachedSize.height, newSize.height),
    ]);
  }

});
