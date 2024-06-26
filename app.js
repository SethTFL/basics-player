import 'https://js.boxcast.com/v3.min.js';
import { html } from "https://esm.sh/htm@3.1.1/react";
import React, { createElement as h, useState, useEffect, useRef } from "https://esm.sh/v118/react@18.2.0";
import { createRoot } from "https://esm.sh/v118/react-dom@18.2.0/client";

/** @type {(props:{channel:string, interval:number, spfio?:Theo.Config, mockURL?:string})=>any} */
const App = props =>
{
    const [ListGet, ListSet] = useState(/** @type {Boxcast.Broadcast[]}*/([]));
    const [SelectedGet, SelectedSet] = useState(/** @type {string|null} */(null));
    const [LeadingGet, LeadingSet] = useState(/** @type {Boxcast.Broadcast|null} */(null));
    const [AlertGet, AlertSet] = useState(false);
    const [UserClickGet, UserClickSet] = useState(false);

    /** @type {(inList:Array<Boxcast.Broadcast>)=>Array<Boxcast.Broadcast>} */
    const SortStart = (inList) => {
        inList.sort((a, b) => a.starts_at > b.starts_at ? 1 : -1);
        inList.forEach( item => item.start = DateParse(item.starts_at));
        return inList;
    };

    const PlayerID = "boxcast-player";
    const Player = useRef(/** @type {Boxcast.Player | null}*/(null));
    const ScrollToRef = useRef(/** @type {HTMLElement | null} */(null));

    // on mount
    useEffect(()=>
    {
        Player.current = boxcast(`#${PlayerID}`);

        /** @type {()=>Promise<void>} */
        const Ping = async () =>
        {
            const response = await fetch(props.mockURL ? props.mockURL : `https://rest.boxcast.com/channels/${props.channel}/broadcasts?l=50`);
            /** @type {Array<Boxcast.BroadcastRaw>} */
            const json = await response.json();
            ListSet(SortStart(json));
        };

        Ping();
        const timer = setInterval(Ping, props.interval);
        return ()=>clearInterval(timer);
    }
    , []);

   // on new list
   useEffect(()=>
   {
       let leading;
       for(let i=0; i<ListGet.length; i++)
       {
           if(ListGet[i].timeframe != "past")
           {
               leading = ListGet[i];

               if(leading.timeframe == "current" || leading.timeframe == "preroll") // if something is selected other than the leading event, alert the user
               {
                    if(leading.id != LeadingGet?.id)// is the leading item about to change?
                    {
                        if(leading.id != SelectedGet)
                        {
                            AlertSet(true);
                        }
                    }
               }

               if(SelectedGet == null) // if nothing is selected select the leading event
               {
                   SelectedSet(leading.id);
               }

               LeadingSet(leading);

               return;
           }
       }

        if(ListGet.length) // if there are events but theres no leading event, clear leading and select the first event
        {
            LeadingSet(null);
            if(SelectedGet == null)
            {
                SelectedSet(ListGet[0].id);
            }
            AlertSet(false);
        }
    }
    , [ListGet]);

    // on new video selected
    useEffect(()=>
    {
        const settings = {
            selectedBroadcastId: SelectedGet,
            showTitle: true,
            showDescription: true,
            showCountdown: true,
            showRelated: false,
            autoplay: true,
            defaultVideo: "next",
            onPlayerStateChanged:/** @type {Boxcast.PlayerHandler} */(state, details)=>{ console.log(state, details);}
        };

        globalThis.player = Player.current;

        Player.current?.loadChannel(props.channel, settings);
        if(UserClickGet)
        {
            setTimeout(()=>ScrollToRef.current?.scrollIntoView({ behavior: "smooth" }), 500);
            UserClickSet(false);
        }
    }
    , [SelectedGet, UserClickGet]);


    /** @type {(inItem:Boxcast.Broadcast)=>void} */
    const SelectionTransition = (inItem) => 
    {
        SelectedSet(inItem.id);
        UserClickSet(true);
    };

    const selectedIndex = ListGet.findIndex((item)=>item.id == SelectedGet);
    const selected = ListGet[selectedIndex]; // we need the index of the boxcat event to lookup the index of the spfio event
    const selectedLive = selected?.timeframe == "current" || selected?.timeframe == "preroll";

    let spfioWidget = null;
    if(selectedLive && props.spfio)
    {
        const event = props.spfio.events[selectedIndex];
        spfioWidget = h(SPFIOWidget, {event, langs:props.spfio.langs, delay:props.spfio.delay});
    }

    return html`
    <div>
        <div class="Boxcast-Upper" ref=${ScrollToRef}>
            <div class="Boxcast-Player" id=${PlayerID}></div>
            <div class="Boxcast-Active">
                <h2>${ selected?.name }</h2>
            </div>
            ${ spfioWidget }
        </div>
        <div class="Boxcast-Playlist">
        ${
            ListGet.map( (item, index) =>
            {
                return h(BroadcastItem,
                {
                    item: item,
                    previous: ListGet[index-1],
                    priority: item.id == LeadingGet?.id,
                    selected: item.id == SelectedGet,
                    select: () => SelectionTransition(item)
                });
            })
        }
        </div>
        <div class=${`Boxcast-Alert ${ AlertGet ? " Show" : null }`}>
            <span class="Close" onClick=${()=>{ AlertSet(false); }}>Dismiss ×</span>
            <h4>A new session is starting:</h4>
            <p>${LeadingGet?.name}</p>
            <button onClick=${()=>{ LeadingGet&&SelectionTransition(LeadingGet); AlertSet(false); }}>Watch Now</button>
        </div>
    </div>
    `;
}

/** @type {(props:{item:Boxcast.Broadcast, previous: false | Boxcast.Broadcast,  priority:boolean, selected:boolean, select:()=>void})=>any} */
const BroadcastItem = ({item, previous, priority, selected, select}) =>
{
    // pointer
    let pointerText;
    if (priority){ pointerText = html`<div class="Badge Next">Next</div>`; }
    if(item.timeframe == "preroll"){ pointerText = html`<div class="Badge Soon">Soon</div>`; }
    if(item.timeframe == "current"){ pointerText = html`<div class="Badge Live">Live</div>`; }

    // (date) partition
    let partition;
    if(!previous || (previous.start.Date !== item.start.Date))
    {
        partition = html`<h3 class="Partition" key=${item.id+item.start.Day} >
            ${item.start.Day}, ${item.start.Month} ${item.start.Date}
        </h3>`;
    }

    // button
    let buttonText;
    if(item.timeframe == "past"){ buttonText = "Rewatch"; }
    if(item.timeframe == "current" || item.timeframe == "preroll"){ buttonText = "Watch"; }
    if(item.timeframe == "future"){ buttonText = "Preview"; }

    return html`
    ${ partition }
    <div class=${`Broadcast ${item.timeframe}`} key=${item.id}>
        <div class="Time">${item.start.Hours}:${item.start.Minutes} ${item.start.M}</div>
        <div class="Title">${item.name}</strong>
        <div class="Control">
            <button onClick=${select} disabled=${selected}>${selected ? "Watching" : buttonText}</button>
        </div>
        <div class="Pointer">${ pointerText }</div>
    </div>`;
};

/** @type {(props:{event:string, langs:Record<string, string>, delay?:number})=>React.ReactNode} */
const SPFIOWidget =(props)=>
{
    const langList = Object.entries(props.langs);

    const [langGet, langSet] = useState("");

    const timer = React.useRef(0);
    const timerRender = React.useRef(/** @type {null|HTMLElement}*/(null));
    const timerCount = React.useRef(0);
    React.useEffect(()=>{

        if(!props.delay){return;}

        if(langGet != "")
        {
            console.log("lang change");

            timerCount.current = props.delay;
            if(timerRender.current)
            {
                timerRender.current.style.display = "block";
            }
            if(timer.current)
            {
                clearInterval(timer.current)
            }
            timer.current = setInterval(()=>{
                timerCount.current--;
                if(timerCount.current < 0)
                {
                    clearInterval(timer.current);
                }
                if(timerRender.current)
                {
                    if(timerCount.current < 0){
                        timerRender.current.style.display = "none";
                    }
                    else{
                        timerRender.current.innerHTML = `Please wait ${timerCount.current} seconds.`;
                    }
                }

            }, 1000);
        }
    }, [langGet])

    const buttons = langList.map(([key, value])=>{
        return h("button", {className:`lang ${langGet == value ? "active" : ""}`, onClick(){langSet(langGet == value ? "" : value)}}, key)
    });

    return h("div", {id:"spfio"}, [
        h("div", {className:`lang-menu ${langGet ? "match" : ""}`}, buttons),
        (langGet && props.delay) && h("p", { ref:timerRender, id:"delay-indicator", style:{display:"none"}}),
        langGet && h("iframe", {src:`https://truthforlife.m.spf.io/ze/${props.event}?embedSubtitleMode=true&channel=${langGet}&presetSubtitleFontSize=20px`}),
    ])
}

/** @type {{Days:Boxcast.NamedDay[], Months:Boxcast.NamedMonth[]}} */
const NamedTime =
{
    Days:["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    Months:["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
}

/** @type {(inDate:string)=>Boxcast.Date} */
const DateParse = (inDateString) =>
{
    const date = new Date(inDateString);
    /** @type {Boxcast.Date} */
    const obj = {
        Zone: date.toString().match(/\(([A-Za-z\s].*)\)/),
        Day: NamedTime.Days[date.getDay()],
        Month: NamedTime.Months[date.getMonth()],
        Date: date.getDate(),
        Hours: date.getHours(),
        Minutes: date.getMinutes(),
        Epoch: date.valueOf()
    };

    obj.Zone = obj.Zone ? obj.Zone[1] : "local time";
    obj.M = obj.Hours >= 12 ? "PM" : "AM";
    obj.Hours %= 12;
    if(obj.Hours == 0){ obj.Hours = 12; }
    if(typeof obj.Minutes == "number" && obj.Minutes < 10){ obj.Minutes = "0"+obj.Minutes; }
    return obj;
};

/** @type {(inChannel:string, inSelector:string, inInterval:number, inSPFIO?:Theo.Config, mockURL?:string)=>void} */
export default (inChannel, inSelector, inInterval, inSPFIO, mockURL) => 
{
    const root = document.querySelector(inSelector);
    if(root)
    {
        /*
        const shadow = root.attachShadow({mode:"open"});
        
        const styles = document.createElement("link");
        styles.setAttribute("rel", "stylesheet");
        styles.setAttribute("type", "text/css");
        styles.setAttribute("href", import.meta.resolve("./styles.css"));
        shadow.appendChild(styles);
        
        const boxcastRoot = document.createElement("div");
        boxcastRoot.id = "boxcast-player"
        shadow.appendChild(boxcastRoot);
        const boxcastPlayer = boxcast(`#${boxcastRoot.id}`);

        const appRoot = document.createElement("div");
        shadow.appendChild(appRoot);
        createRoot(appRoot).render(h(App, {channel:inChannel, interval:inInterval, mock}));
        */

        const styles = document.createElement("link");
        styles.setAttribute("rel", "stylesheet");
        styles.setAttribute("type", "text/css");
        styles.setAttribute("href", import.meta.resolve("./styles.css"));
        root.appendChild(styles);
        
        const appRoot = document.createElement("div");
        root.appendChild(appRoot);
        createRoot(appRoot).render(h(App, {channel:inChannel, interval:inInterval, spfio:inSPFIO, mockURL}));
    }
    else
    {
        console.warn(inSelector, "not found, cannot build player.");
    }
};