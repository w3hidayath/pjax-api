/// <reference path="../define.ts"/>
/// <reference path="_template.ts"/>
/// <reference path="app.ts"/>
/// <reference path="data.ts"/>
/// <reference path="../library/utility.ts"/>
/// <reference path="../view/main.ts"/>
/// <reference path="../controller/main.ts"/>

/* MODEL */

module MODULE.MODEL {
  
  export class Main extends Template implements ModelInterface {

    constructor() {
      super(State.initiate);
    }

    private controller_: ControllerInterface = new Controller(this).singleton()
    private app_: AppLayerInterface = new MODEL.App(this, this.controller_)
    private util_ = LIBRARY.Utility

    private getRequestDomain(): string {
      return this.host();
    }
    private setRequestDomain(host: string): string {
      return this.app_.balance.changeServer(host.split('//').pop());
    }

    isDeferrable: boolean = !!jQuery.when && '1.006' <= jQuery().jquery.match(/\d[\d.]+\d/).pop().replace(/\.(\d+)/g, '.00$1').replace(/0*(\d{3})/g, '$1')

    location: HTMLAnchorElement = document.createElement('a')
    host(): string { return this.app_.balance.host() }
    state(): State { return this.state_; }
    
    main_($context: ExtensionInterface, setting: PjaxSetting): ExtensionInterface
    main_($context: ExtensionStaticInterface, setting: PjaxSetting): ExtensionStaticInterface
    main_($context: any, option: any): any {

      switch (typeof option) {
        case 'object':
          $context = $context instanceof DEF.NAMESPACE ? $context : jQuery(document)[DEF.NAME]();
          FREEZE(option, true);
          break;

        default:
          return $context;
      }

      if (!window.history || !window.history['pushState'] || !window.history['replaceState']) { return $context; }

      this.location.href = this.util_.normalizeUrl(window.location.href);

      var setting: SettingInterface = this.app_.configure(<PjaxSetting>option);
      if (!setting) { return $context; }

      this.app_.data.connect(setting);

      this.speed = {
        fire: 0,
        time: [],
        name: [],
        now: function () { return new Date().getTime(); }
      };

      jQuery(() => {
        this.app_.initialize($context, setting);
        this.state_ = this.state() === State.initiate ? State.open : this.state();
      });

      return $context;
    }

    convertUrlToKeyUrl(unsafe_url: string): string {
      return unsafe_url.replace(/#.*/, '')
    }

    configure(event: Event): SettingInterface
    configure(destination: string): SettingInterface
    configure(destination: HTMLAnchorElement): SettingInterface
    configure(destination: HTMLFormElement): SettingInterface
    configure(destination: Location): SettingInterface
    configure(destination: any): SettingInterface {
      return this.app_.configure(destination);
    }

    isAvailable(event: JQueryEventObject): boolean {
      if (State.open !== this.state()) { return false; }

      if (event.which > 1 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) { return false; }

      var setting: SettingInterface;
      switch (event.type.toLowerCase()) {
        case EVENT.CLICK:
          setting = this.app_.configure(<HTMLAnchorElement>event.currentTarget);
          if (setting && !jQuery(event.currentTarget).filter(setting.filter).length) { return false; }
          break;
        case EVENT.SUBMIT:
          setting = this.app_.configure(<HTMLFormElement>event.currentTarget);
          break;
        case EVENT.POPSTATE:
          setting = this.app_.configure(window.location);
          break;
      }

      if (!setting) { return false; }

      if (setting.origLocation.protocol !== setting.destLocation.protocol || setting.origLocation.host !== setting.destLocation.host) { return false; }

      if (setting.destLocation.hash && setting.origLocation.href.replace(/#.*/, '') === setting.destLocation.href.replace(/#.*/, '')) { return false; }
      if (!this.app_.page.chooseArea(setting.area, document, document)) { return false; }

      return true;
    }

    getXHR(): JQueryXHR {
      return this.app_.page.xhr;
    }
    setXHR(xhr: JQueryXHR): JQueryXHR {
      this.app_.page.xhr && this.app_.page.xhr.readyState < 4 && this.app_.page.xhr.abort();
      return this.app_.page.xhr = xhr;
    }
    
    click(event: JQueryEventObject): void {
      PROCESS: {
        event.timeStamp = new Date().getTime();
        var context = <HTMLAnchorElement>event.currentTarget,
            $context: JQuery = jQuery(context);
        var setting: SettingInterface = this.app_.configure(context);
        
        switch (false) {
          case !event.isDefaultPrevented():
          case !!setting:
          case this.state() === State.open:
          case this.isAvailable(event):
            break PROCESS;
        }
        
        this.app_.page.transfer(setting, event);
        event.preventDefault();
        return;
      };
      // clickメソッド用
      !event.originalEvent && !event.isDefaultPrevented() && !jQuery(document).has(context).length && this.fallback(event);
    }

    submit(event: JQueryEventObject): void {
      PROCESS: {
        event.timeStamp = new Date().getTime();
        var context = <HTMLFormElement>event.currentTarget,
            $context: JQuery = jQuery(context);
        var setting: SettingInterface = this.app_.configure(context);
        
        switch (false) {
          case !event.isDefaultPrevented():
          case !!setting:
          case this.state() === State.open:
          case this.isAvailable(event):
            break PROCESS;
        }
        
        this.app_.page.transfer(setting, event);
        event.preventDefault();
        return;
      };
      // submitメソッド用
      !event.originalEvent && !event.isDefaultPrevented() && !jQuery(document).has(context).length && this.fallback(event);
    }

    popstate(event: JQueryEventObject): void {
      PROCESS: {
        if (this.app_.page.landing && this.app_.page.landing === this.util_.normalizeUrl(window.location.href)) { return; }
        if (this.location.href === this.util_.normalizeUrl(window.location.href)) { return; }
        
        event.timeStamp = new Date().getTime();
        var setting: SettingInterface = this.app_.configure(window.location);
        
        if (setting.origLocation.pathname + setting.origLocation.search === setting.destLocation.pathname + setting.destLocation.search) { return; }
        
        switch (false) {
          //case !event.isDefaultPrevented():
          case !!setting:
          case this.state() === State.open:
          case this.isAvailable(event):
            break PROCESS;
        }
        
        this.app_.page.transfer(setting, event);
        return;
      };
      // pjax処理されないURL変更によるページ更新
      this.fallback(event);
    }
    
    private queue_: number[] = []
    scroll(event: JQueryEventObject, end: boolean): void {
      var id: number;
      while (id = this.queue_.shift()) { clearTimeout(id); }
      id = setTimeout(() => {
        while (id = this.queue_.shift()) { clearTimeout(id); }
        this.util_.compareUrl(window.location.href, this.location.href) && this.app_.data.saveScrollPosition();
      }, 300);
      this.queue_.push(id);
    }

    fallback(event: JQueryEventObject): void {
      var setting: SettingInterface = this.configure(event);
      switch (true) {
        case setting && !setting.fallback:
        case setting && false === this.util_.fire(setting.fallback, setting, [event, setting, setting.origLocation.cloneNode(), setting.destLocation.cloneNode()]):
          break;
        default:
          this.movePageNormally_(event);
      }
    }

    private movePageNormally_(event: JQueryEventObject): void {
      switch (event.type.toLowerCase()) {
        case EVENT.CLICK:
          window.location.assign((<HTMLAnchorElement>event.currentTarget).href);
          break;
        case EVENT.SUBMIT:
          switch ((<HTMLFormElement>event.currentTarget).method.toUpperCase()) {
            case 'GET':
              window.location.assign((<HTMLFormElement>event.currentTarget).action.replace(/[?#].*/, '') + '?' + jQuery(event.currentTarget).serialize());
              break;
            case 'POST':
              window.location.assign((<HTMLFormElement>event.currentTarget).action);
              break;
          }
          break;
        case EVENT.POPSTATE:
          window.location.reload();
          break;
      }
    }

    enable(): void {
      this.state_ = State.open;
    }

    disable(): void {
      this.state_ = State.pause;
    }

    getCache(unsafe_url: string): CacheInterface {
      var setting: SettingInterface = this.configure(this.convertUrlToKeyUrl(unsafe_url));
      if (!setting) { return; }
      var record: PageRecordInterface = this.app_.page.provider.getRecord(setting);
      return record.data.data() || record.data.jqXHR() ? {
        data: record.data.data(),
        textStatus: record.data.textStatus(),
        jqXHR: record.data.jqXHR(),
        expires: record.data.expires(setting.cache.expires.min, setting.cache.expires.max),
        host: record.data.host()
      } : undefined;
    }
    
    setCache(unsafe_url: string, data: string, textStatus: string, jqXHR: JQueryXHR): void {
      var setting: SettingInterface = this.configure(this.convertUrlToKeyUrl(unsafe_url));
      if (!setting) { return; }
      var record: PageRecordInterface = this.app_.page.provider.getRecord(setting);
      this.app_.page.provider.setRecord(setting, data || '', textStatus || record.data.textStatus(), jqXHR || record.data.jqXHR(), record.data.host());
    }

    removeCache(unsafe_url: string): void {
      var setting: SettingInterface = this.configure(this.convertUrlToKeyUrl(unsafe_url));
      if (!setting) { return; }
      this.app_.page.provider.removeRecord(setting);
    }

    clearCache(): void {
      this.app_.page.provider.clearRecord();
    }

    speed: any

  }

  export class Singleton {

    constructor() {
      Singleton.instance_ = Singleton.instance_ || new Main();
    }

    private static instance_: Main

    static singleton(): Main {
      return Singleton.instance_;
    }

    singleton(): Main {
      return Singleton.singleton();
    }

  }

}

module MODULE {
  export var Model = MODEL.Singleton
}