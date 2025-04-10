import {
  type BridgeFeatureFlags,
  type HomeAssistantEntityState,
  type MediaPlayerDeviceAttributes,
  MediaPlayerDeviceFeature,
} from "@home-assistant-matter-hub/common";
import { SpeakerDevice } from "@matter/main/devices";
import { OnOffPlugInUnitDevice } from "@matter/main/devices";
import { testBit } from "../../utils/test-bit.js";
import { BasicInformationServer } from "../behaviors/basic-information-server.js";
import { IdentifyServer } from "../behaviors/identify-server.js";
import {
  type LevelControlConfig,
  LevelControlServer,
} from "../behaviors/level-control-server.js";
import { MediaInputServer } from "../behaviors/media-input-server.js";
import { type OnOffConfig, OnOffServer } from "../behaviors/on-off-server.js";
import { HomeAssistantEntityBehavior } from "../custom-behaviors/home-assistant-entity-behavior.js";

const muteOnOffConfig: OnOffConfig = {
  turnOn: {
    action: "media_player.volume_mute",
    data: { is_volume_muted: false },
  },
  turnOff: {
    action: "media_player.volume_mute",
    data: { is_volume_muted: true },
  },
  isOn: (state: HomeAssistantEntityState<MediaPlayerDeviceAttributes>) => {
    return !state.attributes.is_volume_muted;
  },
};

const FallbackEndpointType = OnOffPlugInUnitDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomeAssistantEntityBehavior,
  OnOffServer.with("Lighting"),
);

const SpeakerEndpointType = SpeakerDevice.with(
  BasicInformationServer,
  IdentifyServer,
  HomeAssistantEntityBehavior,
);

const volumeLevelConfig: LevelControlConfig = {
  getValue: (state: HomeAssistantEntityState<MediaPlayerDeviceAttributes>) => {
    if (state.attributes.volume_level != null) {
      return state.attributes.volume_level * 100;
    }
    return 0;
  },
  getMinValue: (_: HomeAssistantEntityState) => 0,
  getMaxValue: (_: HomeAssistantEntityState) => 100,
  moveToLevel: {
    action: "media_player.volume_set",
    data: (value) => {
      return { volume_level: value / 100 };
    },
  },
};

export function MediaPlayerDevice(
  homeAssistantEntity: HomeAssistantEntityBehavior.State,
  featureFlags?: BridgeFeatureFlags,
) {
  if (!featureFlags?.matterSpeakers) {
    return FallbackEndpointType.set({ homeAssistantEntity });
  }
  const attributes = homeAssistantEntity.entity.state
    .attributes as MediaPlayerDeviceAttributes;
  const supportedFeatures = attributes.supported_features ?? 0;

  // TODO: Support power control, which needs to be implemented as another
  // OnOffServer on a separate endpoint for this device.
  let device = SpeakerEndpointType;
  if (testBit(supportedFeatures, MediaPlayerDeviceFeature.VOLUME_MUTE)) {
    device = device.with(OnOffServer.set({ config: muteOnOffConfig }));
  }
  if (testBit(supportedFeatures, MediaPlayerDeviceFeature.VOLUME_SET)) {
    const levelControl = testBit(
      supportedFeatures,
      MediaPlayerDeviceFeature.VOLUME_MUTE,
    )
      ? LevelControlServer.with("OnOff")
      : LevelControlServer;
    device = device.with(levelControl.set({ config: volumeLevelConfig }));
  }
  if (testBit(supportedFeatures, MediaPlayerDeviceFeature.SELECT_SOURCE)) {
    device = device.with(MediaInputServer);
  }
  return device.set({ homeAssistantEntity });
}
