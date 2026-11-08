import { Events } from "@wailsio/runtime";

export function EventsOn(eventName: string, callback: (...args: any[]) => void): () => void {
    return Events.On(eventName, (event: any) => {
        callback(event ? event.data : undefined);
    });
}

export function EventsEmit(eventName: string, ...data: any[]): void {
    Events.Emit(eventName, data.length === 1 ? data[0] : data);
}

