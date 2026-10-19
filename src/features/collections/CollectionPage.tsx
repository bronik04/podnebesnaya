import { collectionCardSubtitle } from '../../content/collection-scope';
import {
  COLLECTION_GROUPS,
  collectionById,
  isDraft,
  type Collection,
} from '../../content/collections';
import { landmarkById } from '../../content/landmarks';
import { physicalFeatureById } from '../../content/physical-features';
import { regionsWord } from '../../content/region-count';
import type { Region } from '../../content/types';
import { sourceById } from '../../content/sources';
import { ChinaMap } from '../../map/ChinaMap';
import { MapAttribution } from '../../map/MapAttribution';
import { CollectionImage } from '../../ui/CollectionImage';
import { PhotoSlot } from '../../ui/PhotoSlot';
import { CardFacts, RegionReference } from '../../ui/RegionReference';
import { SiteFooter } from '../../ui/SiteFooter';
import { CollectionCard } from '../home/CollectionCard';

export type CollectionPageProps = {
  readonly collection: Collection;
  readonly regions: readonly Region[];
  readonly onOpenCollections: () => void;
  readonly onOpenCollection: (collectionId: string) => void;
  /** Раунд по регионам коллекции. Отсюда и берётся её польза на уроке. */
  readonly onTrainRegions: (regionIds: readonly string[]) => void;
};

/**
 * Страница коллекции. Слева — что это, справа — где это на карте и как
 * спросить об этом класс.
 *
 * Пустые места названы вслух. Коллекции пока черновые: справка не написана,
 * фотографий нет, источник не проставлен. Экран, который в этом случае просто
 * не показывает раздел, выглядит сломанным; экран, который говорит «справка
 * ещё не написана», выглядит незаполненным — и это правда.
 */
export function CollectionPage({
  collection,
  regions,
  onOpenCollections,
  onOpenCollection,
  onTrainRegions,
}: CollectionPageProps) {
  const group = COLLECTION_GROUPS.find(({ id }) => id === collection.groupId);
  const memberRegions = collection.regionIds
    .map((id) => regions.find((region) => region.id === id))
    .filter((region): region is Region => region !== undefined);
  const related = collection.relatedIds
    .map((id) => collectionById(id))
    .filter((item): item is Collection => item !== undefined);
  const draft = isDraft(collection);
  /*
   * Регион, о котором коллекция. Признак стоит в каталоге, а не выводится из
   * числа регионов: у коллекции о месте регион тоже один, но она не о нём.
   */
  const aboutRegion = regions.find(
    (region) => region.id === collection.aboutRegionId,
  );
  const aboutFeature =
    collection.aboutFeatureId === undefined
      ? undefined
      : physicalFeatureById(collection.aboutFeatureId);
  const aboutLandmark =
    collection.aboutLandmarkId === undefined
      ? undefined
      : landmarkById(collection.aboutLandmarkId);
  /*
   * У объекта и у достопримечательности справка — это их факты, и приходят они
   * из одного справочника на обе поверхности: карточку и эту страницу.
   */
  const catalogFacts = aboutFeature?.facts ?? aboutLandmark?.facts ?? [];
  /*
   * Справка из справочника стоит на странице и говорит за неё. У региона она
   * есть всегда — центр и города написаны, даже когда фактов нет; у объекта
   * она и есть факты, поэтому до того, как их напишут, страница честно
   * называет себя незаполненной, а не делает вид, что полна.
   */
  /*
   * Первый снимок идёт крупным кадром вместо места под фотографию, остальные —
   * в сетку ниже. Отдельного поля «главный снимок» не заводится: их было бы
   * два места правды, и однажды главный исчез бы из галереи или задвоился в
   * ней.
   */
  const [hero, ...gallery] = collection.photos;
  const referenceShown = aboutRegion !== undefined || catalogFacts.length > 0;

  return (
    <main className="site-main">
      <nav className="breadcrumb" aria-label="Путь к странице">
        <button type="button" className="text" onClick={onOpenCollections}>
          Коллекции
        </button>
        {group ? <span aria-hidden="true"> · </span> : null}
        {group ? <span>{group.title}</span> : null}
        <span aria-hidden="true"> · </span>
        <span aria-current="page">{collection.nameRu}</span>
      </nav>

      <div className="collection-layout">
        <article className="collection-main">
          <p className="eyebrow">
            {group ? `${group.title} · ` : ''}
            {collection.kind}
          </p>
          <h1>{collection.nameRu}</h1>
          <p lang="zh-Hans" className="collection-name-zh">
            {collection.nameZh}
          </p>
          <p lang="zh-Latn-pinyin" className="collection-pinyin">
            {collection.pinyin}
          </p>

          {/*
            Пустая вводка — незаполненность только там, где вводку пишут
            руками. У коллекции о регионе её нет по устройству: сразу за
            заголовком идёт справка из справочника, и объявлять недостачу
            перед ней значило бы называть страницу пустой на глазах у полной.
          */}
          {collection.lead !== '' ? (
            <p className="lead">{collection.lead}</p>
          ) : !referenceShown ? (
            <p className="empty-note">
              Описание ещё не написано. Пока коллекция держит только привязку к
              регионам — по ней уже можно собрать раунд.
            </p>
          ) : null}

          {/*
            Место под фотографию, которой нет, занимала заглушка — а справочник
            давно написан. У региона это центр, факты с источниками и города; у
            объекта — те же факты, что показывает карточка атласа. Список
            регионов объекта сюда не идёт: он стоит справа, у карты.

            Условие — признак в каталоге, а не «ровно один регион»: у
            коллекции о месте регион тоже один, но она не о нём.
          */}
          {/*
            Снимок идёт первым, справка за ним: сначала место, потом рассказ о
            нём. Раньше у коллекции о регионе снимка не было вовсе, и справка
            стояла сразу за заголовком; теперь снимок есть у всех, и прятать
            его под три факта значило бы отдать ему худшее место на странице.
          */}
          {hero === undefined ? null : (
            <CollectionImage
              photo={hero}
              height="hero"
              sizes="(min-width: 60rem) 40rem, 100vw"
            />
          )}

          {aboutRegion !== undefined ? (
            <RegionReference region={aboutRegion} />
          ) : catalogFacts.length > 0 ? (
            <CardFacts facts={catalogFacts} />
          ) : hero === undefined ? (
            <PhotoSlot subject={collection.nameRu} height="hero" />
          ) : null}

          {/*
            Раздел не исчезает, когда справку просто не написали: экран без
            него выглядит сломанным, а с пометкой — незаполненным, и это
            правда. Исчезает он только у коллекции о регионе без дописок: там
            справка уже стоит выше, и «справка ещё не написана» под ней было
            бы прямой неправдой.
          */}
          {referenceShown && collection.notes.length === 0 ? null : (
            <section className="collection-block">
              <h2>Что стоит знать</h2>
              {collection.notes.length === 0 ? (
                <p className="empty-note">
                  Справка ещё не написана: её пишет учитель и подтверждает
                  источником.
                </p>
              ) : (
                <ul className="rule-list">
                  {collection.notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="collection-block">
            <div className="landing-section-head">
              <h2>Фотографии</h2>
              <p className="group-hint">
                {collection.photos.length === 0
                  ? 'снимков пока нет'
                  : `снимков: ${collection.photos.length} · подпись у каждого`}
              </p>
            </div>
            {gallery.length === 0 ? (
              <p className="empty-note">
                {hero === undefined
                  ? 'Фотографии подбирает учитель. Пока их нет, '
                  : 'Других снимков пока нет, '}
                {referenceShown
                  ? 'страница держится справкой и картой.'
                  : 'коллекция работает как список регионов.'}
              </p>
            ) : (
              <ul className="photo-grid">
                {gallery.map((photo) => (
                  <li key={photo.id}>
                    <CollectionImage
                      photo={photo}
                      height="thumb"
                      sizes="(min-width: 60rem) 13rem, 45vw"
                    />
                    <p className="caption">
                      {photo.captionRu}
                      {photo.captionZh ? (
                        <>
                          {' '}
                          <span lang="zh-Hans">{photo.captionZh}</span>
                        </>
                      ) : null}{' '}
                      · {photo.place}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </article>

        <aside className="collection-aside">
          <section className="paper-panel">
            <p className="panel-title">Регионы коллекции</p>
            {memberRegions.length === 0 ? (
              <p className="empty-note">
                Коллекция не привязана к отдельным регионам: {collection.scopeLabel ?? 'охват не указан'}.
              </p>
            ) : (
              <>
                <ChinaMap
                  regions={regions}
                  selectedRegionId={null}
                  onSelect={() => {}}
                  onClear={() => {}}
                  variant="membership"
                  usage="answer"
                  interactive={false}
                  memberRegionIds={collection.regionIds}
                />
                <p className="membership-legend">
                  <span data-membership="member" /> входит в коллекцию
                  <span data-membership="outside" /> остальные
                </p>
                {/*
                  Список — не дубль карты, а равнозначный ей способ прочитать
                  тот же ответ: заливку на мелких областях не разглядеть, а
                  читалке экрана карта без списка ничего не перечислит.
                */}
                <ul className="member-list">
                  {memberRegions.map((region) => (
                    <li key={region.id}>{region.nameRu}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="primary"
                  onClick={() => onTrainRegions(collection.regionIds)}
                >
                  Спросить эти регионы
                </button>
                <p className="status-note">
                  {memberRegions.length} {regionsWord(memberRegions.length)} ·
                  игра «найти регион»
                </p>
              </>
            )}
          </section>

          <section className="outline-panel">
            <p className="panel-title">Источники</p>
            {draft ? (
              <p className="draft-note" data-testid="draft-note">
                Черновик: содержание этой коллекции ещё не проверено по
                источникам. Подтверждён только справочник регионов — названия,
                иероглифы и административные центры.
              </p>
            ) : (
              <ul className="rule-list">
                {collection.sourceIds.map((sourceId) => {
                  const source = sourceById(sourceId);

                  return (
                    <li key={sourceId}>
                      {source === undefined
                        ? sourceId
                        : `${source.title} — ${source.shortLabel ?? source.organization}`}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {related.length > 0 ? (
        <section className="landing-section raised">
          <h2>Смотрите также</h2>
          <ul className="collection-grid">
            {related.map((item) => (
              <CollectionCard
                key={item.id}
                collection={item}
                subtitle={collectionCardSubtitle(item, regions)}
                showsGroup
                onOpen={onOpenCollection}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <SiteFooter left={<MapAttribution />} right="Фотографии подбирает учитель" />
    </main>
  );
}
